/**
 * Import the real product catalogue from data/catalog/*.json (format: data/catalog/README.md).
 *
 *   npm run import:products                 # create missing products as unpublished drafts
 *   npm run import:products -- --publish    # also mark new products reviewed and publish them
 *   npm run import:products -- --check      # validate the files only; write nothing
 *   npm run import:products -- --apply-market-prices
 *                                           # set researched market prices as the selling price
 *   npm run import:products -- --refresh-content
 *                                           # update description/specs/warranty of products nobody has edited
 *
 * Idempotent by SKU: missing variants are added; an existing variant only gains a price if it has
 * never had one (so prices found later can be added by re-running). Every file is
 * validated before anything is written. List prices become PENDING proposals for the Super Admin
 * (Dashboard → Price review); the website shows "Price on request" until one is approved.
 * With --apply-market-prices, a variant that has no approved price gets its researched market price
 * as its selling price straight away (replacing any pending proposal); a price someone has approved
 * is never touched. With --refresh-content, an existing product's description, specifications and
 * warranty follow the files, unless a person has ever edited the product (a "product.update" in the
 * audit log), in which case the shop's own text is kept. Images are
 * downloaded, re-encoded by the normal upload service and stored; a failed image is reported and
 * retried on the next run for products that still have none. Actions are audited under the first
 * active Super Admin; with no Super Admin yet the import is skipped.
 */
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const DATA_DIR = process.env.CATALOG_DIR ?? path.join(process.cwd(), "data", "catalog");
const LANES = 16;
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
  listPriceIncludesTax: z
    .boolean()
    .nullish()
    .transform((v) => v ?? true),
  mrp: money.nullish(),
  priceSource: z.string().nullish(),
  /** Researched price a local dealer charges (incl. GST), used with --apply-market-prices. */
  marketPrice: money.nullish(),
  marketPriceSource: z.string().nullish(),
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
  const applyMarketPrices = process.argv.includes("--apply-market-prices");
  const refreshContent = process.argv.includes("--refresh-content");
  const items = await loadFiles();

  // Products are imported LANES at a time, each lane on its own connection: on a hosted build the
  // database can be far away (every query a round trip of ~0.2 s), and a big price list means tens of
  // thousands of queries. The pool is sized for the lanes before it is first created.
  process.env.DB_POOL_MAX = String(Math.max(Number(process.env.DB_POOL_MAX ?? 10), LANES + 1));
  const { getDb, getPool } = await import("../src/server/db/client");
  const schema = await import("../src/server/db/schema");
  const { and, eq, sql } = await import("drizzle-orm");
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
      if (v.marketPrice && v.mrp && Number(v.marketPrice) > Number(v.mrp)) {
        problems.push(`${at}: ${v.sku} market price ₹${v.marketPrice} is above its MRP ₹${v.mrp}`);
      }
      if (v.marketPrice && !v.marketPriceSource) problems.push(`${at}: ${v.sku} market price has no marketPriceSource`);
    }
  }
  if (problems.length) throw new Error(`Catalogue check failed:\n  ${problems.join("\n  ")}`);
  const variantCount = items.reduce((n, i) => n + i.product.variants.length, 0);
  console.log(`Catalogue files OK: ${items.length} products, ${variantCount} variants.`);
  if (checkOnly) {
    await getPool().end();
    return;
  }

  const { auditActorOf, loadActor } = await import("../src/server/auth/actor");
  const { audit } = await import("../src/server/audit");
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

  // Everything a re-run needs to know, in three queries, so unchanged products cost no round trips.
  const known = new Map(
    (
      await db.execute<{ sku: string; variant_id: string; product_id: string; priced: boolean; approved: boolean }>(
        sql`select upper(v.sku) as sku, v.id as variant_id, v.product_id,
                   exists(select 1 from variant_prices p where p.variant_id = v.id) as priced,
                   exists(select 1 from variant_prices p where p.variant_id = v.id and p.status = 'approved') as approved
            from product_variants v`,
      )
    ).rows.map((r) => [r.sku, r]),
  );
  const withImages = new Set(
    (await db.execute<{ product_id: string }>(sql`select distinct product_id from product_images`)).rows.map((r) => r.product_id),
  );
  const isNew = ({ product: p }: Loaded) => !p.variants.some((v) => known.has(v.sku));

  // For --refresh-content: the current text of every product, and the products a person has edited.
  const content = new Map(
    refreshContent
      ? (
          await db
            .select({ id: schema.products.id, description: schema.products.description, specifications: schema.products.specifications, warrantyInfo: schema.products.warrantyInfo })
            .from(schema.products)
        ).map((r) => [r.id, r])
      : [],
  );
  const editedByStaff = new Set(
    refreshContent
      ? (await db.selectDistinct({ id: schema.auditLogs.entityId }).from(schema.auditLogs).where(eq(schema.auditLogs.action, "product.update"))).map((r) => r.id)
      : [],
  );

  // Brands first, one at a time, so parallel product imports never race to create the same brand.
  for (const item of items.filter(isNew)) {
    const brand = item.product.brand;
    if (brand && !brandIds.has(brand.toLowerCase())) {
      brandIds.set(brand.toLowerCase(), (await catalog.createBrand(actor, { name: brand, manufacturer: item.product.manufacturer ?? null })).id);
    }
  }

  const stats = { products: 0, variants: 0, prices: 0, marketPrices: 0, refreshed: 0, images: 0, imageFailures: 0, published: 0 };
  const failures: string[] = [];

  async function importOne({ file, researchedOn, product: p }: Loaded) {
    try {
      const existing = p.variants.flatMap((v) => known.get(v.sku) ?? []);
      let productId = existing[0]?.product_id;
      const created = !productId;

      if (!productId) {
        const source = `Public sources (researched ${researchedOn}): ${p.sourceUrls.join(" ")}`;
        const product = await catalog.createProduct(
          actor,
          productInput.parse({
            name: p.name,
            categoryId: cats.find((c) => c.slug === p.category)!.id,
            brandId: p.brand ? brandIds.get(p.brand.toLowerCase())! : null,
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

      const current = content.get(productId);
      if (refreshContent && !created && current && !editedByStaff.has(productId)) {
        // Normalise the file's text exactly as the app stores it, so unchanged text compares equal.
        const next = {
          description: productInput.shape.description.parse(p.description ?? null) ?? null,
          specifications: productInput.shape.specifications.parse(p.specifications.filter((s) => s.label.trim() && s.value.trim()).slice(0, 60)) ?? [],
          warrantyInfo: productInput.shape.warrantyInfo.parse(p.warranty ?? null) ?? null,
        };
        const same =
          current.description === next.description &&
          current.warrantyInfo === next.warrantyInfo &&
          JSON.stringify(current.specifications) === JSON.stringify(next.specifications);
        if (!same) {
          await db.transaction(async (tx) => {
            await tx.update(schema.products).set({ ...next, updatedAt: new Date() }).where(eq(schema.products.id, productId));
            await audit(tx, auditActorOf(actor), {
              action: "product.catalog_refresh",
              entityType: "product",
              entityId: productId,
              summary: `Catalogue text refreshed from the data files: "${p.name}"`,
            });
          });
          stats.refreshed++;
        }
      }

      for (const [i, v] of p.variants.entries()) {
        const prior = known.get(v.sku);
        let variantId = prior?.variant_id;
        const useMarketPrice = applyMarketPrices && !!v.marketPrice && !prior?.approved;
        if (prior) {
          // A price found after the first import fills a variant that has never had one.
          if (!useMarketPrice && (prior.priced || !v.listPrice)) continue;
        } else {
          const variant = await catalog.createVariant(
            actor,
            productId,
            variantInput.parse({ sku: v.sku, name: v.name, attributes: v.attributes, barcode: v.barcode ?? null, unitCode: p.unit, sortOrder: i }),
          );
          variantId = variant.id;
          stats.variants++;
          if (p.altUnit) await catalog.addUnitConversion(actor, variant.id, p.altUnit.unit, p.altUnit.factor);
        }
        if (useMarketPrice) {
          const reason = `Market price (researched): ${v.marketPriceSource}`;
          await pricing.proposePrice(actor, {
            variantId: variantId!,
            price: v.marketPrice!,
            priceIncludesTax: true,
            mrp: v.mrp ?? null,
            reason: reason.length > 300 ? `${reason.slice(0, 299)}…` : reason,
          });
          stats.marketPrices++;
        } else if (v.listPrice) {
          const reason = `Manufacturer list price: ${v.priceSource ?? "see product sources"}`;
          await pricing.proposePrice(actor, {
            variantId: variantId!,
            price: v.listPrice,
            priceIncludesTax: v.listPriceIncludesTax,
            mrp: v.mrp ?? null,
            reason: reason.length > 300 ? `${reason.slice(0, 299)}…` : reason,
            requireApproval: true,
          });
          stats.prices++;
        }
      }

      if (!withImages.has(productId) && p.images.length) {
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

  // Each lane takes the next waiting group as soon as it is free, biggest first, so no lane is left
  // with most of the work. Products whose names give the same URL slug form one group and are
  // imported one after the other, so they never race for the same slug.
  const groups = new Map<string, Loaded[]>();
  for (const item of items) {
    const key = item.product.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const work = (g: Loaded[]) => g.reduce((n, i) => n + (isNew(i) ? i.product.variants.length : 0), 0);
  const queue = [...groups.values()].sort((a, b) => work(b) - work(a));
  let done = 0;
  await Promise.all(
    Array.from({ length: LANES }, async () => {
      for (let group = queue.shift(); group; group = queue.shift()) {
        for (const item of group) {
          await importOne(item);
          if (++done % 10 === 0 || done === items.length) console.log(`  … ${done}/${items.length} products processed`);
        }
      }
    }),
  );

  console.log(
    `Imported ${stats.products} new products and ${stats.variants} variants; ${stats.prices} prices await approval; ` +
      `${stats.marketPrices} market prices applied; ${stats.refreshed} products' text refreshed; ` +
      `${stats.images} images stored (${stats.imageFailures} skipped); ${stats.published} published.`,
  );
  if (failures.length) console.log(`Products with errors (fix the data and run again):\n  ${failures.join("\n  ")}`);
  await getPool().end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
