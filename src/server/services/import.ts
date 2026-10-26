import "server-only";
/**
 * Bulk product import from a spreadsheet saved as CSV (UTF-8). One row per sellable variant;
 * rows with the same product_name + brand + category become one product.
 *
 * Two-step: `validateImport` (dry run, returns a row-by-row report) then `commitImport`
 * (all-or-nothing transaction). Imported products are created UNPUBLISHED with review status
 * "draft" so nothing reaches the website before someone reviews it, unless a person allowed to
 * publish asks for them to go live straight away. Photos given as `image_url` links are fetched
 * after the products are saved; a photo that can't be fetched is reported, not fatal.
 */
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { brands, categories, products, productVariants, taxClasses, units, variantCosts, variantPrices } from "@/server/db/schema";
import { audit } from "@/server/audit";
import { auditActorOf, can, requirePermission, type Actor } from "@/server/auth/actor";
import { invalid } from "@/server/errors";
import { getSettings } from "@/server/settings";
import { getDefaultPriceList, itcPolicyFor } from "@/server/services/pricing";
import { uploadProductImage } from "@/server/services/uploads";
import { fetchRemoteImage } from "@/server/remote-image";
import { isValidHsn, slugify, slugOr } from "@/lib/india";
import { D, m } from "@/lib/money";
import { landedUnitCost } from "@/lib/pricing/engine";

export { IMPORT_COLUMNS, REQUIRED_COLUMNS } from "@/lib/import-columns";
import { IMPORT_COLUMNS, REQUIRED_COLUMNS } from "@/lib/import-columns";

/** RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF/LF, BOM). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"' && field === "") inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const yes = (v: string) => /^(y|yes|true|1)$/i.test(v.trim());

/** Photo links in an `image_url` cell: up to 4, separated by spaces, commas or semicolons. */
function imageUrls(cell: string): string[] {
  return cell.split(/[\s,;]+/).filter(Boolean);
}
const MAX_PHOTOS = 4;

export interface ImportRowResult {
  row: number;
  sku: string;
  product: string;
  status: "ok" | "error" | "warning";
  messages: string[];
}

interface ParsedRow {
  row: number;
  data: Record<(typeof IMPORT_COLUMNS)[number], string>;
}

async function loadRows(csv: string): Promise<ParsedRow[]> {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw invalid("The file has no data rows");
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw invalid(`Missing required columns: ${missing.join(", ")}`);
  if (rows.length > 5001) throw invalid("Import at most 5,000 rows at a time");
  return rows.slice(1).map((r, i) => {
    const data = {} as ParsedRow["data"];
    for (const col of IMPORT_COLUMNS) {
      const idx = header.indexOf(col);
      data[col] = idx >= 0 ? (r[idx] ?? "").trim() : "";
    }
    return { row: i + 2, data };
  });
}

function parsePairs(s: string, sep: ":" | "="): { label: string; value: string }[] {
  if (!s.trim()) return [];
  return s
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const idx = p.indexOf(sep);
      if (idx < 1) throw new Error(`"${p}" should look like Name${sep}Value`);
      return { label: p.slice(0, idx).trim(), value: p.slice(idx + 1).trim() };
    });
}

export async function validateImport(actor: Actor, csv: string) {
  requirePermission(actor, "catalog.import");
  const rows = await loadRows(csv);
  const db = getDb();
  const [cats, unitRows, taxRows, existingSkus, existingBarcodes] = [
    await db.select().from(categories),
    await db.select().from(units),
    await db.select().from(taxClasses),
    await db.select({ sku: sql<string>`upper(${productVariants.sku})` }).from(productVariants),
    await db.select({ b: productVariants.barcode }).from(productVariants),
  ];
  const skuSet = new Set(existingSkus.map((s) => s.sku));
  const barcodeSet = new Set(existingBarcodes.map((b) => b.b).filter(Boolean));
  const seenSku = new Set<string>();
  const seenBarcode = new Set<string>();
  const canPrice = can(actor, "prices.edit");
  const canCost = can(actor, "costs.edit");

  const results: ImportRowResult[] = rows.map(({ row, data }) => {
    const msgs: string[] = [];
    const warn: string[] = [];
    for (const c of REQUIRED_COLUMNS) if (!data[c]) msgs.push(`${c} is required`);
    const sku = data.sku.toUpperCase();
    if (data.sku && !/^[A-Za-z0-9][A-Za-z0-9._/-]{1,39}$/.test(data.sku)) msgs.push("SKU must be 2–40 letters/digits (may include . _ / -)");
    if (sku && skuSet.has(sku)) msgs.push(`SKU ${data.sku} already exists`);
    if (sku && seenSku.has(sku)) msgs.push(`SKU ${data.sku} appears more than once in this file`);
    seenSku.add(sku);
    if (data.barcode) {
      if (barcodeSet.has(data.barcode)) msgs.push(`Barcode ${data.barcode} already exists`);
      if (seenBarcode.has(data.barcode)) msgs.push(`Barcode ${data.barcode} repeated in this file`);
      seenBarcode.add(data.barcode);
    }
    const cat = cats.find((c) => c.slug === data.category || c.name.toLowerCase() === data.category.toLowerCase());
    if (data.category && !cat) msgs.push(`Unknown category "${data.category}" — create it first`);
    if (data.unit && !unitRows.some((u) => u.code === data.unit)) msgs.push(`Unknown unit "${data.unit}" (use: ${unitRows.map((u) => u.code).join(", ")})`);
    if (data.hsn_code && !isValidHsn(data.hsn_code)) msgs.push("HSN must be 4–8 digits");
    if (data.gst_rate && !taxRows.some((t) => D(t.gstRate).equals(D(data.gst_rate)))) msgs.push(`No tax class with GST ${data.gst_rate}% — create it in Settings first`);
    if (!data.gst_rate) warn.push("No GST rate — product will use no tax class until set");
    for (const k of ["mrp", "selling_price", "purchase_cost", "purchase_tax_rate", "freight", "handling"] as const) {
      if (data[k] && !/^\d{1,10}(\.\d{1,4})?$/.test(data[k])) msgs.push(`${k} must be a number`);
    }
    if (data.selling_price && data.mrp && /^\d/.test(data.mrp) && /^\d/.test(data.selling_price) && yes(data.price_includes_tax || "yes") && D(data.selling_price).greaterThan(D(data.mrp))) {
      msgs.push("Selling price cannot exceed MRP");
    }
    if (yes(data.is_sample) && !actor.isSuperAdmin) msgs.push("Only the Super Admin can add SAMPLE (training) products");
    if (data.selling_price && !canPrice) warn.push("You can't set prices — selling_price will be ignored");
    if (data.purchase_cost && !canCost) warn.push("You can't record costs — cost columns will be ignored");
    if (!data.selling_price) warn.push("No selling price — the item can't be sold until a price is set");
    const photos = imageUrls(data.image_url);
    if (photos.length > MAX_PHOTOS) msgs.push(`image_url has ${photos.length} links — at most ${MAX_PHOTOS} photos per product`);
    for (const u of photos) {
      if (!/^https?:\/\/[^\s/]+\.[^\s/]+\//i.test(u)) msgs.push(`image_url "${u.slice(0, 60)}" is not a web address (https://…)`);
    }
    if (photos.length && !can(actor, "catalog.edit")) warn.push("You can't add photos — image_url will be ignored");
    try {
      parsePairs(data.specifications, ":");
      parsePairs(data.variant_attributes, "=");
    } catch (e) {
      msgs.push((e as Error).message);
    }
    return {
      row,
      sku: data.sku,
      product: data.product_name,
      status: msgs.length ? "error" : warn.length ? "warning" : "ok",
      messages: [...msgs, ...warn],
    };
  });
  return {
    rows: results,
    errorCount: results.filter((r) => r.status === "error").length,
    productCount: new Set(rows.map((r) => `${r.data.product_name}|${r.data.brand}|${r.data.category}`.toLowerCase())).size,
    variantCount: rows.length,
    photoCount: new Set(rows.flatMap((r) => imageUrls(r.data.image_url))).size,
  };
}

export interface ImportOptions {
  /** Approve and publish the new products at once (needs the publish permission). */
  publish?: boolean;
  /**
   * Put the selling prices in force at once (the default). They still wait for approval when the
   * importer may not approve prices and approval is required. False keeps them pending for review.
   */
  pricesLive?: boolean;
  /** The rows were read from a scan or photo: their prices always wait for review. */
  scanned?: boolean;
}

export async function commitImport(actor: Actor, csv: string, opts: ImportOptions = {}) {
  const report = await validateImport(actor, csv);
  if (report.errorCount) throw invalid(`Fix ${report.errorCount} row(s) with errors before importing`, { report });
  const rows = await loadRows(csv);
  const canPrice = can(actor, "prices.edit");
  const canCost = can(actor, "costs.edit");
  const autoApprove = opts.pricesLive !== false && !opts.scanned && (can(actor, "prices.approve") || !(await getSettings("pricing")).priceChangeRequiresApproval);
  // One id per import, on every price it brings in, so those prices can be reviewed and decided together.
  const batchId = randomUUID();
  const tax = await getSettings("tax");
  const itcPolicy = itcPolicyFor(tax.registrationType);
  const publish = !!opts.publish && can(actor, "catalog.publish");
  const db = getDb();
  const saved = await db.transaction(async (tx) => {
    const cats = await tx.select().from(categories);
    const taxRows = await tx.select().from(taxClasses);
    const list = await getDefaultPriceList(tx);
    const brandCache = new Map<string, string>();
    const productCache = new Map<string, string>();
    const photos = new Map<string, { name: string; urls: string[] }>();
    const now = new Date();
    let createdProducts = 0;
    let createdVariants = 0;
    let createdPrices = 0;
    for (const { data } of rows) {
      let brandId: string | null = null;
      if (data.brand) {
        const key = data.brand.toLowerCase();
        brandId = brandCache.get(key) ?? null;
        if (!brandId) {
          const [existing] = await tx.select().from(brands).where(sql`lower(${brands.name}) = ${key}`);
          brandId = existing?.id ?? (await tx.insert(brands).values({ name: data.brand, slug: slugOr(data.brand, "brand") }).returning())[0].id;
          brandCache.set(key, brandId);
        }
      }
      const cat = cats.find((c) => c.slug === data.category || c.name.toLowerCase() === data.category.toLowerCase())!;
      const taxClass = data.gst_rate ? taxRows.find((t) => D(t.gstRate).equals(D(data.gst_rate))) : undefined;
      const pkey = `${data.product_name}|${data.brand}|${data.category}`.toLowerCase();
      let productId = productCache.get(pkey);
      if (!productId) {
        // A name with no Latin letters (Hindi, Gujarati) is addressed by the brand and the first code instead.
        const root = slugify(data.product_name) ? slugify(`${data.brand} ${data.product_name}`) : slugOr(`${data.brand} ${data.sku}`, "product");
        let slug = root;
        for (let i = 2; (await tx.select({ id: products.id }).from(products).where(eq(products.slug, slug))).length; i++) slug = `${root}-${i}`;
        const variantAttributes = [...new Set(rows.filter((r) => `${r.data.product_name}|${r.data.brand}|${r.data.category}`.toLowerCase() === pkey).flatMap((r) => parsePairs(r.data.variant_attributes, "=").map((p) => p.label)))];
        const [p] = await tx
          .insert(products)
          .values({
            slug,
            name: data.product_name,
            brandId,
            categoryId: cat.id,
            manufacturer: data.manufacturer || null,
            model: data.model || null,
            description: data.description || null,
            specifications: parsePairs(data.specifications, ":"),
            variantAttributes,
            warrantyInfo: data.warranty || null,
            hsnCode: data.hsn_code || null,
            taxClassId: taxClass?.id ?? null,
            unitCode: data.unit,
            isSample: yes(data.is_sample),
            sourceInfo: data.source_info || "Bulk import",
            isPublished: publish,
            reviewStatus: publish ? "approved" : "draft",
            createdBy: actor.id,
            updatedBy: actor.id,
          })
          .returning();
        productId = p.id;
        productCache.set(pkey, productId);
        createdProducts++;
      }
      const urls = imageUrls(data.image_url);
      if (urls.length) {
        const entry = photos.get(productId) ?? { name: data.product_name, urls: [] };
        for (const u of urls) if (!entry.urls.includes(u) && entry.urls.length < MAX_PHOTOS) entry.urls.push(u);
        photos.set(productId, entry);
      }
      const attrs = Object.fromEntries(parsePairs(data.variant_attributes, "=").map((p) => [p.label, p.value]));
      const [v] = await tx
        .insert(productVariants)
        .values({ productId, sku: data.sku, barcode: data.barcode || null, name: data.variant_name, attributes: attrs, unitCode: data.unit })
        .returning();
      createdVariants++;
      if (canPrice && data.selling_price) {
        await tx.insert(variantPrices).values({
          variantId: v.id,
          priceListId: list.id,
          price: m(data.selling_price),
          priceIncludesTax: data.price_includes_tax ? yes(data.price_includes_tax) : tax.pricesIncludeTaxByDefault,
          mrp: data.mrp ? m(data.mrp) : null,
          effectiveFrom: now,
          status: autoApprove ? "approved" : "pending",
          reason: opts.scanned ? "Bulk import (read from a scan)" : "Bulk import",
          createdBy: actor.id,
          decidedBy: autoApprove ? actor.id : null,
          decidedAt: autoApprove ? now : null,
          importBatchId: batchId,
        });
        createdPrices++;
      }
      if (canCost && data.purchase_cost) {
        const landed = landedUnitCost({
          purchaseCost: data.purchase_cost,
          purchaseTaxRate: data.purchase_tax_rate || "0",
          freight: data.freight || "0",
          handling: data.handling || "0",
          itcPolicy,
        });
        await tx.insert(variantCosts).values({
          variantId: v.id,
          purchaseCost: D(data.purchase_cost).toFixed(4),
          purchaseTaxRate: data.purchase_tax_rate || "0",
          freight: D(data.freight || 0).toFixed(4),
          handling: D(data.handling || 0).toFixed(4),
          itcPolicy,
          landedCost: landed.toFixed(4),
          effectiveFrom: now,
          reason: "Bulk import",
          createdBy: actor.id,
        });
      }
    }
    await audit(tx, auditActorOf(actor), {
      action: "catalog.import",
      entityType: "catalog",
      summary: `Imported ${createdProducts} products / ${createdVariants} variants (${publish ? "published on the website" : "unpublished, awaiting review"})`,
      data: {
        createdProducts,
        createdVariants,
        published: publish,
        pricesStatus: canPrice ? (autoApprove ? "approved" : "pending") : "skipped",
        createdPrices,
        batchId,
        pricesLive: opts.pricesLive !== false,
        scanned: !!opts.scanned,
      },
    });
    // When the prices were created (the transaction's time, rounded up to the millisecond), so that
    // deciding them all from the result screen does not depend on the browser's clock.
    const [{ at }] = (await tx.execute<{ at: string }>(sql`select ceil(extract(epoch from now()) * 1000)::bigint::text as at`)).rows;
    return { createdProducts, createdVariants, createdPrices, photos, pricesAt: new Date(Number(at)) };
  });

  // Photos are fetched after the products are saved: a slow or broken link must not hold the
  // transaction open or undo the import. Each failure is reported back.
  const images = { stored: 0, failed: [] as { product: string; url: string; reason: string }[] };
  if (can(actor, "catalog.edit")) {
    const jobs = [...saved.photos].flatMap(([productId, p]) => p.urls.map((url) => ({ productId, name: p.name, url })));
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        try {
          const bytes = await fetchRemoteImage(job.url);
          await uploadProductImage(actor, job.productId, { bytes, alt: job.name });
          images.stored++;
        } catch (err) {
          images.failed.push({ product: job.name, url: job.url, reason: err instanceof Error ? err.message : String(err) });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker));
  }
  const prices: { status: "approved" | "pending" | "none"; count: number; batchId: string; asOf: string } = {
    status: saved.createdPrices ? (autoApprove ? "approved" : "pending") : "none",
    count: saved.createdPrices,
    batchId,
    asOf: saved.pricesAt.toISOString(),
  };
  return { createdProducts: saved.createdProducts, createdVariants: saved.createdVariants, published: publish, images, prices };
}

export function importTemplateCsv(): string {
  const header = IMPORT_COLUMNS.join(",");
  const example = [
    "Example Interior Emulsion",
    "berger-paints",
    "Berger",
    "Berger Paints India Ltd",
    "",
    "Replace with the description from the official product catalogue",
    "3209",
    "18",
    "bucket",
    "As per manufacturer",
    "Finish: Matt; Coverage: (from data sheet)",
    "Catalogue page / data sheet reference",
    "",
    "EXAMPLE-SKU-10L",
    "",
    "White 10 L",
    "Colour=White; Pack size=10 L",
    "",
    "",
    "yes",
    "",
    "18",
    "0",
    "0",
    "yes",
  ];
  return `${header}\r\n${example.map((v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")}\r\n`;
}
