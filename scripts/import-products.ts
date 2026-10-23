/**
 * Import the real product catalogue from data/catalog/*.json (format: data/catalog/README.md).
 *
 *   npm run import:products                 # create missing products as unpublished drafts
 *   npm run import:products -- --publish    # also mark new products reviewed and publish them
 *   npm run import:products -- --check      # validate the files only; write nothing
 *
 * Idempotent by SKU: existing variants are left alone, missing ones are added. Every file is
 * validated before anything is written. List prices become PENDING proposals for the Super Admin
 * (Dashboard → Price review); the website shows "Price on request" until one is approved. Images are
 * downloaded, re-encoded by the normal upload service and stored; a failed image is reported and
 * retried on the next run for products that still have none. Actions are audited under the first
 * active Super Admin; with no Super Admin yet the import is skipped.
 */
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const DATA_DIR = process.env.CATALOG_DIR ?? path.join(process.cwd(), "data", "catalog");
const IMAGE_TIMEOUT_MS = 20_000;
const IMAGE_MAX_BYTES = 6 * 1024 * 1024;

// Researchers sometimes write prices as numbers; keep money as exact strings.
const money = z.preprocess(
  (v) => (typeof v === "number" ? v.toFixed(2) : v),
  z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "price must look like 1234.50"),
);

const variantSchema = z.object({
  sku: z.string().regex(/^[A-Z0-9][A-Z0-9-]{1,39}$/, "SKU: uppercase letters, digits and -"),
  name: z.string().trim().min(1).max(120),
  attributes: z.record(z.string(), z.string()).default({}),
  barcode: z.string().nullish(),
  listPrice: money.nullish(),
  listPriceIncludesTax: z.boolean().default(true),
  mrp: money.nullish(),
  priceSource: z.string().nullish(),
});

const productSchema = z.object({
  category: z.string(),
  brand: z.string().trim().min(1).nullish(),
  manufacturer: z.string().nullish(),
  name: z.string().trim().min(2).max(160),
  model: z.string().nullish(),
  description: z.string().nullish(),
  unit: z.string(),
  hsn: z.string().regex(/^\d{4,8}$/).nullish(),
  gstRate: z.preprocess((v) => (typeof v === "number" ? String(v) : v), z.string()),
  warranty: z.string().nullish(),
  specifications: z.array(z.object({ label: z.string(), value: z.preprocess((v) => String(v), z.string()) })).default([]),
  variantAttributes: z.array(z.string()).default([]),
  images: z.array(z.string().url()).default([]),
  sourceUrls: z.array(z.string().url()).default([]),
  altUnit: z.object({ unit: z.string(), factor: z.preprocess((v) => String(v), z.string()) }).nullish(),
  featured: z.boolean().default(false),
  variants: z.array(variantSchema).min(1),
});

const fileSchema = z.object({
  group: z.string(),
  researchedOn: z.string(),
  notes: z.array(z.string()).default([]),
  products: z.array(productSchema),
});

type CatalogProduct = z.infer<typeof productSchema>;
type Loaded = { file: string; researchedOn: string; product: CatalogProduct };

async function loadFiles(): Promise<Loaded[]> {
  const names = (await readdir(DATA_DIR)).filter((n) => n.endsWith(".json")).sort();
  const out: Loaded[] = [];
  const errors: string[] = [];
  for (const name of names) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path.join(DATA_DIR, name), "utf8"));
    } catch (err) {
      errors.push(`${name}: not valid JSON (${err instanceof Error ? err.message : err})`);
      continue;
    }
    const res = fileSchema.safeParse(parsed);
    if (!res.success) {
      for (const issue of res.error.issues.slice(0, 20)) errors.push(`${name}: ${issue.path.join(".")}: ${issue.message}`);
      continue;
    }
    for (const product of res.data.products) out.push({ file: name, researchedOn: res.data.researchedOn, product });
  }
  if (errors.length) throw new Error(`Catalogue files are invalid:\n  ${errors.join("\n  ")}`);
  return out;
}

/** Image bytes from a public URL, or a reason it couldn't be fetched. */
async function download(url: string): Promise<Buffer | string> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OM-Enterprise-catalogue-import)", Accept: "image/*" },
    });
    if (!res.ok) return `HTTP ${res.status}`;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return `not an image (${type || "no content type"})`;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > IMAGE_MAX_BYTES) return "larger than 6 MB";
    return bytes;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const publish = process.argv.includes("--publish");
  const items = await loadFiles();

  const { getDb, getPool } = await import("../src/server/db/client");
  const schema = await import("../src/server/db/schema");
  const { and, eq, inArray, sql } = await import("drizzle-orm");
  const { productInput, variantInput } = await import("../src/lib/validation");
  const db = getDb();

  // Validate everything against the database's reference data before writing anything.
  const cats = await db.select().from(schema.categories);
  const units = await db.select().from(schema.units);
  const taxes = await db.select().from(schema.taxClasses);
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const { file, product: p } of items) {
    const at = `${file} · ${p.name}`;
    if (!cats.some((c) => c.slug === p.category)) problems.push(`${at}: unknown category "${p.category}"`);
    if (!units.some((u) => u.code === p.unit)) problems.push(`${at}: unknown unit "${p.unit}"`);
    if (p.altUnit && !units.some((u) => u.code === p.altUnit!.unit)) problems.push(`${at}: unknown alternate unit "${p.altUnit.unit}"`);
    if (!taxes.some((t) => Number(t.gstRate) === Number(p.gstRate))) problems.push(`${at}: no tax class for GST ${p.gstRate}%`);
    if (p.variantAttributes.length > 6) problems.push(`${at}: more than 6 variant attributes`);
    for (const v of p.variants) {
      const other = seen.get(v.sku);
      if (other) problems.push(`${at}: SKU ${v.sku} is also used by ${other}`);
      seen.set(v.sku, at);
      if (v.listPrice && v.mrp && v.listPriceIncludesTax && Number(v.listPrice) > Number(v.mrp)) {
        problems.push(`${at}: ${v.sku} list price ₹${v.listPrice} is above its MRP ₹${v.mrp}`);
      }
    }
  }
  if (problems.length) throw new Error(`Catalogue check failed:\n  ${problems.join("\n  ")}`);
  const variantCount = items.reduce((n, i) => n + i.product.variants.length, 0);
  console.log(`Catalogue files OK: ${items.length} products, ${variantCount} variants.`);
  if (checkOnly) {
    await getPool().end();
    return;
  }

  const { loadActor } = await import("../src/server/auth/actor");
  const catalog = await import("../src/server/services/catalog");
  const pricing = await import("../src/server/services/pricing");
  const { uploadProductImage } = await import("../src/server/services/uploads");

  const [sa] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(and(eq(schema.roles.key, "super_admin"), eq(schema.users.isActive, true)))
    .limit(1);
  if (!sa) {
    console.log("No active Super Admin yet; product import skipped.");
    await getPool().end();
    return;
  }
  const actor = (await loadActor(sa.id))!;
  const brandIds = new Map((await db.select().from(schema.brands)).map((b) => [b.name.toLowerCase(), b.id]));

  const stats = { products: 0, variants: 0, prices: 0, images: 0, imageFailures: 0, published: 0 };
  const failures: string[] = [];
  for (const { file, researchedOn, product: p } of items) {
    try {
      const skus = p.variants.map((v) => v.sku);
      const existing = await db
        .select({ sku: schema.productVariants.sku, productId: schema.productVariants.productId })
        .from(schema.productVariants)
        .where(inArray(sql`upper(${schema.productVariants.sku})`, skus));
      let productId = existing[0]?.productId;
      const created = !productId;

      if (!productId) {
        let brandId: string | null = null;
        if (p.brand) {
          brandId = brandIds.get(p.brand.toLowerCase()) ?? null;
          if (!brandId) {
            brandId = (await catalog.createBrand(actor, { name: p.brand, manufacturer: p.manufacturer ?? null })).id;
            brandIds.set(p.brand.toLowerCase(), brandId);
          }
        }
        const source = `Public sources (researched ${researchedOn}): ${p.sourceUrls.join(" ")}`;
        const product = await catalog.createProduct(
          actor,
          productInput.parse({
            name: p.name,
            categoryId: cats.find((c) => c.slug === p.category)!.id,
            brandId,
            manufacturer: p.manufacturer ?? null,
            model: p.model ?? null,
            description: p.description ?? null,
            specifications: p.specifications.filter((s) => s.label.trim() && s.value.trim()).slice(0, 60),
            variantAttributes: p.variantAttributes,
            warrantyInfo: p.warranty ?? null,
            hsnCode: p.hsn ?? null,
            taxClassId: taxes.find((t) => Number(t.gstRate) === Number(p.gstRate))!.id,
            unitCode: p.unit,
            isFeatured: p.featured,
            sourceInfo: source.length > 500 ? `${source.slice(0, 497)}…` : source,
          }),
        );
        productId = product.id;
        stats.products++;
      }

      for (const [i, v] of p.variants.entries()) {
        if (existing.some((e) => e.sku.toUpperCase() === v.sku)) continue;
        const variant = await catalog.createVariant(
          actor,
          productId,
          variantInput.parse({ sku: v.sku, name: v.name, attributes: v.attributes, barcode: v.barcode ?? null, unitCode: p.unit, sortOrder: i }),
        );
        stats.variants++;
        if (p.altUnit) await catalog.addUnitConversion(actor, variant.id, p.altUnit.unit, p.altUnit.factor);
        if (v.listPrice) {
          const reason = `Manufacturer list price: ${v.priceSource ?? "see product sources"}`;
          await pricing.proposePrice(actor, {
            variantId: variant.id,
            price: v.listPrice,
            priceIncludesTax: v.listPriceIncludesTax,
            mrp: v.mrp ?? null,
            reason: reason.length > 300 ? `${reason.slice(0, 299)}…` : reason,
            requireApproval: true,
          });
          stats.prices++;
        }
      }

      const [{ count }] = (
        await db.execute<{ count: number }>(sql`select count(*)::int as count from product_images where product_id = ${productId}`)
      ).rows;
      if (Number(count) === 0 && p.images.length) {
        const results = await Promise.all(p.images.slice(0, 4).map(async (url) => ({ url, got: await download(url) })));
        for (const { url, got } of results) {
          if (typeof got === "string") {
            stats.imageFailures++;
            console.log(`  image skipped (${got}): ${p.name} ← ${url}`);
            continue;
          }
          try {
            await uploadProductImage(actor, productId, { bytes: got, alt: p.name });
            stats.images++;
          } catch (err) {
            stats.imageFailures++;
            console.log(`  image rejected (${err instanceof Error ? err.message : err}): ${p.name} ← ${url}`);
          }
        }
      }

      if (created && publish) {
        await catalog.setProductReview(actor, productId, "approved");
        await catalog.setProductPublished(actor, productId, true);
        stats.published++;
      }
    } catch (err) {
      failures.push(`${file} · ${p.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `Imported ${stats.products} new products and ${stats.variants} variants; ${stats.prices} prices await approval; ` +
      `${stats.images} images stored (${stats.imageFailures} skipped); ${stats.published} published.`,
  );
  if (failures.length) console.log(`Products with errors (fix the data and run again):\n  ${failures.join("\n  ")}`);
  await getPool().end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
