import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { getDb, type Tx } from "@/server/db/client";
import {
  brands,
  categories,
  priceLists,
  productImages,
  products,
  productVariants,
  taxClasses,
  units,
  variantCompatibility,
  variantPrices,
  variantUnitConversions,
  type SpecRow,
} from "@/server/db/schema";
import { audit, diff } from "@/server/audit";
import { auditActorOf, can, requirePermission, type Actor } from "@/server/auth/actor";
import { conflict, forbidden, invalid, notFound } from "@/server/errors";
import { slugify } from "@/lib/india";
import { D } from "@/lib/money";
import {
  getActiveCosts,
  getActivePrices,
  getDefaultPriceList,
  getVariantPricingContext,
  unitPriceForQuantity,
} from "@/server/services/pricing";

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

export async function listUnits(tx?: Tx) {
  return (tx ?? getDb()).select().from(units).orderBy(asc(units.name));
}

export async function listTaxClasses(tx?: Tx) {
  return (tx ?? getDb()).select().from(taxClasses).orderBy(desc(taxClasses.gstRate));
}

export async function listPriceLists(tx?: Tx) {
  return (tx ?? getDb()).select().from(priceLists).orderBy(desc(priceLists.isDefault), asc(priceLists.name));
}

export async function createTaxClass(actor: Actor, input: { name: string; gstRate: string; cessRate?: string; isExempt?: boolean; description?: string | null }) {
  requirePermission(actor, "settings.tax");
  if (D(input.gstRate).greaterThan(100) || D(input.gstRate).isNegative()) throw invalid("Invalid GST rate");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(taxClasses)
      .values({ name: input.name, gstRate: input.gstRate, cessRate: input.cessRate ?? "0", isExempt: input.isExempt ?? D(input.gstRate).isZero(), description: input.description ?? null })
      .returning();
    await audit(tx, auditActorOf(actor), {
      action: "tax_class.create",
      entityType: "tax_class",
      entityId: row.id,
      summary: `Created tax class ${row.name} (${row.gstRate}%)`,
    });
    return row;
  });
}

export async function createUnit(actor: Actor, input: { code: string; name: string; uqc: string; decimals: number }) {
  requirePermission(actor, "catalog.create");
  if (!/^[a-z][a-z0-9_]{0,19}$/.test(input.code)) throw invalid("Unit code: lowercase letters/digits");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(units).values(input).returning();
    await audit(tx, auditActorOf(actor), { action: "unit.create", entityType: "unit", entityId: row.code, summary: `Created unit ${row.name}` });
    return row;
  });
}

/* ------------------------------------------------------------------ */
/* Categories & brands                                                 */
/* ------------------------------------------------------------------ */

export async function listCategories(tx?: Tx) {
  return (tx ?? getDb()).select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
}

type CategoryInput = {
  name: string;
  slug?: string;
  parentId?: string | null;
  description?: string | null;
  icon?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  isPublished?: boolean;
  targetMarginPercent?: string | null;
  minMarginPercent?: string | null;
};

function assertMarginPermission(actor: Actor, input: { targetMarginPercent?: unknown; minMarginPercent?: unknown }) {
  if ((input.targetMarginPercent !== undefined || input.minMarginPercent !== undefined) && !can(actor, "discounts.configure")) {
    throw forbidden("Changing margin rules requires the discount policy permission");
  }
}

export async function createCategory(actor: Actor, input: CategoryInput) {
  requirePermission(actor, "catalog.create");
  assertMarginPermission(actor, input);
  const db = getDb();
  return db.transaction(async (tx) => {
    if (input.parentId) {
      const [parent] = await tx.select().from(categories).where(eq(categories.id, input.parentId));
      if (!parent) throw notFound("Parent category");
    }
    const [row] = await tx
      .insert(categories)
      .values({ ...input, slug: input.slug || slugify(input.name) })
      .returning();
    await audit(tx, auditActorOf(actor), { action: "category.create", entityType: "category", entityId: row.id, summary: `Created category ${row.name}` });
    return row;
  });
}

export async function updateCategory(actor: Actor, id: string, input: Partial<CategoryInput>) {
  requirePermission(actor, "catalog.edit");
  assertMarginPermission(actor, input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(categories).where(eq(categories.id, id));
    if (!before) throw notFound("Category");
    if (input.parentId === id) throw invalid("A category cannot be its own parent");
    if (input.parentId) {
      // prevent cycles
      let cursor: string | null = input.parentId;
      for (let depth = 0; cursor && depth < 20; depth++) {
        if (cursor === id) throw invalid("That would create a category loop");
        const [p] = await tx.select({ parentId: categories.parentId }).from(categories).where(eq(categories.id, cursor));
        cursor = p?.parentId ?? null;
      }
    }
    const [row] = await tx
      .update(categories)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning();
    await audit(tx, auditActorOf(actor), {
      action: "category.update",
      entityType: "category",
      entityId: id,
      summary: `Updated category ${row.name}`,
      data: { changes: diff(before as Record<string, unknown>, row as Record<string, unknown>) },
    });
    return row;
  });
}

export async function listBrands(tx?: Tx) {
  return (tx ?? getDb()).select().from(brands).orderBy(asc(brands.name));
}

export async function createBrand(actor: Actor, input: { name: string; manufacturer?: string | null; description?: string | null; website?: string | null; isActive?: boolean }) {
  requirePermission(actor, "catalog.create");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(brands).values({ ...input, slug: slugify(input.name) }).returning();
    await audit(tx, auditActorOf(actor), { action: "brand.create", entityType: "brand", entityId: row.id, summary: `Created brand ${row.name}` });
    return row;
  });
}

export async function updateBrand(actor: Actor, id: string, input: Partial<{ name: string; manufacturer: string | null; description: string | null; website: string | null; isActive: boolean }>) {
  requirePermission(actor, "catalog.edit");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(brands).where(eq(brands.id, id));
    if (!before) throw notFound("Brand");
    const [row] = await tx
      .update(brands)
      .set({ ...input, ...(input.name ? { slug: slugify(input.name) } : {}) })
      .where(eq(brands.id, id))
      .returning();
    await audit(tx, auditActorOf(actor), {
      action: "brand.update",
      entityType: "brand",
      entityId: id,
      summary: `Updated brand ${row.name}`,
      data: { changes: diff(before as Record<string, unknown>, row as Record<string, unknown>) },
    });
    return row;
  });
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

export interface ProductInput {
  name: string;
  slug?: string;
  brandId?: string | null;
  categoryId: string;
  manufacturer?: string | null;
  model?: string | null;
  description?: string | null;
  specifications?: SpecRow[];
  variantAttributes?: string[];
  warrantyInfo?: string | null;
  hsnCode?: string | null;
  taxClassId?: string | null;
  unitCode: string;
  discountEligible?: boolean;
  isActive?: boolean;
  isFeatured?: boolean;
  isSample?: boolean;
  sourceInfo?: string | null;
}

async function uniqueSlug(tx: Tx, base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || "product";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const rows = await tx.select({ id: products.id }).from(products).where(eq(products.slug, candidate));
    if (!rows.length || rows[0].id === excludeId) return candidate;
  }
  throw conflict("Could not generate a unique URL for this product");
}

export async function createProduct(actor: Actor, input: ProductInput) {
  requirePermission(actor, "catalog.create");
  const db = getDb();
  return db.transaction(async (tx) => {
    const slug = input.slug ? await uniqueSlug(tx, input.slug) : await uniqueSlug(tx, input.name);
    const [row] = await tx
      .insert(products)
      .values({
        ...input,
        slug,
        specifications: input.specifications ?? [],
        variantAttributes: input.variantAttributes ?? [],
        isPublished: false,
        reviewStatus: "draft",
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .returning();
    await audit(tx, auditActorOf(actor), {
      action: "product.create",
      entityType: "product",
      entityId: row.id,
      summary: `Created product "${row.name}"${row.isSample ? " [SAMPLE]" : ""}`,
    });
    return row;
  });
}

export async function updateProduct(actor: Actor, id: string, input: Partial<ProductInput>) {
  requirePermission(actor, "catalog.edit");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(products).where(eq(products.id, id));
    if (!before) throw notFound("Product");
    const set: Partial<typeof products.$inferInsert> = { ...input, updatedAt: new Date(), updatedBy: actor.id };
    if (input.slug && input.slug !== before.slug) set.slug = await uniqueSlug(tx, input.slug, id);
    // Material edits to a reviewed product send it back for review (stays published until re-reviewed).
    const material = ["name", "description", "specifications", "hsnCode", "taxClassId", "warrantyInfo", "unitCode"] as const;
    if (before.reviewStatus === "approved" && material.some((k) => input[k] !== undefined && JSON.stringify(input[k]) !== JSON.stringify(before[k]))) {
      set.reviewStatus = "pending_review";
    }
    const [row] = await tx.update(products).set(set).where(eq(products.id, id)).returning();
    const changes = diff(before as Record<string, unknown>, row as Record<string, unknown>);
    delete changes.updatedAt;
    await audit(tx, auditActorOf(actor), {
      action: "product.update",
      entityType: "product",
      entityId: id,
      summary: `Updated product "${row.name}"`,
      data: { changes },
    });
    return row;
  });
}

/** Review & publication workflow: draft → pending_review → approved; publishing requires approved. */
export async function setProductReview(actor: Actor, id: string, status: "draft" | "pending_review" | "approved") {
  if (status === "approved") requirePermission(actor, "catalog.publish");
  else requirePermission(actor, "catalog.edit");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(products).where(eq(products.id, id));
    if (!before) throw notFound("Product");
    const set: Partial<typeof products.$inferInsert> = { reviewStatus: status, updatedAt: new Date(), updatedBy: actor.id };
    if (status !== "approved" && before.isPublished) set.isPublished = false;
    await tx.update(products).set(set).where(eq(products.id, id));
    await audit(tx, auditActorOf(actor), {
      action: "product.review",
      entityType: "product",
      entityId: id,
      summary: `Review status of "${before.name}": ${before.reviewStatus} → ${status}${set.isPublished === false ? " (unpublished)" : ""}`,
    });
  });
}

export async function setProductPublished(actor: Actor, id: string, publish: boolean) {
  requirePermission(actor, "catalog.publish");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(products).where(eq(products.id, id));
    if (!p) throw notFound("Product");
    if (publish) {
      if (p.reviewStatus !== "approved") throw invalid("Mark the product information as reviewed before publishing");
      if (!p.isActive) throw invalid("Activate the product before publishing");
      const vs = await tx.select({ id: productVariants.id }).from(productVariants).where(and(eq(productVariants.productId, id), eq(productVariants.isActive, true)));
      if (!vs.length) throw invalid("Add at least one active variant before publishing");
    }
    await tx.update(products).set({ isPublished: publish, updatedAt: new Date(), updatedBy: actor.id }).where(eq(products.id, id));
    await audit(tx, auditActorOf(actor), {
      action: publish ? "product.publish" : "product.unpublish",
      entityType: "product",
      entityId: id,
      summary: `${publish ? "Published" : "Unpublished"} "${p.name}" on the website`,
    });
  });
}

export interface AdminProductFilter {
  q?: string;
  categoryId?: string;
  brandId?: string;
  status?: "all" | "published" | "unpublished" | "inactive" | "sample" | "needs_review";
  page?: number;
  pageSize?: number;
}

export async function listProductsAdmin(actor: Actor, f: AdminProductFilter) {
  requirePermission(actor, ["catalog.view", "catalog.edit"]);
  const db = getDb();
  const where: SQL[] = [];
  if (f.q) {
    const like = `%${f.q.trim()}%`;
    where.push(
      or(
        ilike(products.name, like),
        ilike(products.model, like),
        sql`exists (select 1 from product_variants pv where pv.product_id = ${products.id} and (pv.sku ilike ${like} or pv.name ilike ${like} or pv.barcode = ${f.q.trim()}))`,
      )!,
    );
  }
  if (f.categoryId) where.push(eq(products.categoryId, f.categoryId));
  if (f.brandId) where.push(eq(products.brandId, f.brandId));
  switch (f.status) {
    case "published":
      where.push(eq(products.isPublished, true));
      break;
    case "unpublished":
      where.push(eq(products.isPublished, false));
      break;
    case "inactive":
      where.push(eq(products.isActive, false));
      break;
    case "sample":
      where.push(eq(products.isSample, true));
      break;
    case "needs_review":
      where.push(sql`${products.reviewStatus} <> 'approved'`);
      break;
  }
  const pageSize = Math.min(f.pageSize ?? 50, 200);
  const page = Math.max(1, f.page ?? 1);
  const rows = await db
    .select({
      p: products,
      brandName: brands.name,
      categoryName: categories.name,
      variantCount: sql<number>`(select count(*)::int from product_variants pv where pv.product_id = ${products.id})`,
      total: sql<number>`count(*) over ()::int`,
    })
    .from(products)
    .leftJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(products.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    total: rows[0]?.total ?? 0,
    page,
    pageSize,
    items: rows.map((r) => ({ ...r.p, brandName: r.brandName, categoryName: r.categoryName, variantCount: r.variantCount })),
  };
}

/** Full product detail for the admin editor. Costs are included only with costs.view. */
export async function getProductAdmin(actor: Actor, id: string) {
  requirePermission(actor, ["catalog.view", "catalog.edit"]);
  const db = getDb();
  const [p] = await db.select().from(products).where(eq(products.id, id));
  if (!p) throw notFound("Product");
  const variants = await db.select().from(productVariants).where(eq(productVariants.productId, id)).orderBy(asc(productVariants.sortOrder), asc(productVariants.name));
  const ids = variants.map((v) => v.id);
  const lists = await listPriceLists();
  const pricesByList: Record<string, Record<string, unknown>> = {};
  for (const l of lists) {
    const active = await getActivePrices(ids, l.id);
    pricesByList[l.id] = Object.fromEntries([...active].map(([k, v]) => [k, v]));
  }
  const pending = ids.length
    ? await db.select().from(variantPrices).where(and(inArray(variantPrices.variantId, ids), eq(variantPrices.status, "pending")))
    : [];
  const scheduled = ids.length
    ? await db
        .select()
        .from(variantPrices)
        .where(and(inArray(variantPrices.variantId, ids), eq(variantPrices.status, "approved"), sql`${variantPrices.effectiveFrom} > now()`))
    : [];
  const costs = can(actor, "costs.view") ? Object.fromEntries(await getActiveCosts(ids)) : null;
  const ctx = Object.fromEntries(await getVariantPricingContext(ids));
  const images = await db.select().from(productImages).where(eq(productImages.productId, id)).orderBy(asc(productImages.sortOrder));
  const conversions = ids.length ? await db.select().from(variantUnitConversions).where(inArray(variantUnitConversions.variantId, ids)) : [];
  const compat = ids.length
    ? await db
        .select({
          a: variantCompatibility.variantA,
          b: variantCompatibility.variantB,
          note: variantCompatibility.note,
        })
        .from(variantCompatibility)
        .where(or(inArray(variantCompatibility.variantA, ids), inArray(variantCompatibility.variantB, ids)))
    : [];
  const otherIds = [...new Set(compat.flatMap((c) => [c.a, c.b]).filter((x) => !ids.includes(x)))];
  const others = otherIds.length
    ? await db
        .select({ id: productVariants.id, sku: productVariants.sku, name: productVariants.name, productName: products.name, productId: products.id })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(inArray(productVariants.id, otherIds))
    : [];
  return { product: p, variants, priceLists: lists, pricesByList, pending, scheduled, costs, context: ctx, images, conversions, compat, compatVariants: others };
}

/* ------------------------------------------------------------------ */
/* Variants                                                            */
/* ------------------------------------------------------------------ */

export interface VariantInput {
  sku: string;
  barcode?: string | null;
  name: string;
  attributes?: Record<string, string>;
  unitCode: string;
  taxClassId?: string | null;
  discountEligible?: boolean | null;
  targetMarginPercent?: string | null;
  minMarginPercent?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  reorderLevel?: string | null;
}

export async function createVariant(actor: Actor, productId: string, input: VariantInput) {
  requirePermission(actor, "catalog.create");
  assertMarginPermission(actor, input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(products).where(eq(products.id, productId));
    if (!p) throw notFound("Product");
    const [row] = await tx
      .insert(productVariants)
      .values({ ...input, sku: input.sku.trim(), productId, attributes: input.attributes ?? {} })
      .returning();
    await audit(tx, auditActorOf(actor), {
      action: "variant.create",
      entityType: "variant",
      entityId: row.id,
      summary: `Added variant ${row.sku} "${row.name}" to "${p.name}"`,
    });
    return row;
  });
}

export async function updateVariant(actor: Actor, id: string, input: Partial<VariantInput>) {
  requirePermission(actor, "catalog.edit");
  assertMarginPermission(actor, input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(productVariants).where(eq(productVariants.id, id));
    if (!before) throw notFound("Variant");
    if (input.sku && input.sku.toUpperCase() !== before.sku.toUpperCase()) {
      const used = await tx.execute(sql`select 1 from sale_lines where variant_id = ${id} limit 1`);
      if (used.rows.length) throw conflict("This SKU appears on past sales and cannot be changed. Create a new variant instead.");
    }
    const [row] = await tx.update(productVariants).set({ ...input, updatedAt: new Date() }).where(eq(productVariants.id, id)).returning();
    const changes = diff(before as Record<string, unknown>, row as Record<string, unknown>);
    delete changes.updatedAt;
    await audit(tx, auditActorOf(actor), {
      action: "variant.update",
      entityType: "variant",
      entityId: id,
      summary: `Updated variant ${row.sku}`,
      data: { changes },
    });
    return row;
  });
}

export async function addUnitConversion(actor: Actor, variantId: string, unitCode: string, factor: string) {
  requirePermission(actor, "catalog.edit");
  if (!/^\d{1,8}(\.\d{1,6})?$/.test(factor) || D(factor).lessThanOrEqualTo(0)) throw invalid("Conversion factor must be a positive number");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [v] = await tx.select().from(productVariants).where(eq(productVariants.id, variantId));
    if (!v) throw notFound("Variant");
    if (v.unitCode === unitCode) throw invalid("That is already the variant's base unit");
    const [row] = await tx.insert(variantUnitConversions).values({ variantId, unitCode, factor, createdBy: actor.id }).returning();
    await audit(tx, auditActorOf(actor), {
      action: "variant.unit_conversion_add",
      entityType: "variant",
      entityId: variantId,
      summary: `Allowed selling ${v.sku} by ${unitCode} (1 ${unitCode} = ${factor} ${v.unitCode})`,
    });
    return row;
  });
}

export async function removeUnitConversion(actor: Actor, conversionId: string) {
  requirePermission(actor, "catalog.edit");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.delete(variantUnitConversions).where(eq(variantUnitConversions.id, conversionId)).returning();
    if (!row) throw notFound("Unit conversion");
    await audit(tx, auditActorOf(actor), {
      action: "variant.unit_conversion_remove",
      entityType: "variant",
      entityId: row.variantId,
      summary: `Removed unit ${row.unitCode} from variant`,
    });
  });
}

export async function linkCompatibility(actor: Actor, variantId: string, otherVariantId: string, note?: string | null) {
  requirePermission(actor, "catalog.edit");
  if (variantId === otherVariantId) throw invalid("A variant cannot be linked to itself");
  const [a, b] = [variantId, otherVariantId].sort();
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.insert(variantCompatibility).values({ variantA: a, variantB: b, note: note ?? null, createdBy: actor.id }).onConflictDoNothing();
    await audit(tx, auditActorOf(actor), {
      action: "variant.compatibility_link",
      entityType: "variant",
      entityId: variantId,
      summary: `Marked variants as compatible`,
      data: { a, b, note: note ?? null },
    });
  });
}

export async function unlinkCompatibility(actor: Actor, variantId: string, otherVariantId: string) {
  requirePermission(actor, "catalog.edit");
  const [a, b] = [variantId, otherVariantId].sort();
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.delete(variantCompatibility).where(and(eq(variantCompatibility.variantA, a), eq(variantCompatibility.variantB, b)));
    await audit(tx, auditActorOf(actor), {
      action: "variant.compatibility_unlink",
      entityType: "variant",
      entityId: variantId,
      summary: `Removed compatibility link`,
      data: { a, b },
    });
  });
}

/* ------------------------------------------------------------------ */
/* POS search                                                          */
/* ------------------------------------------------------------------ */

export interface SellableVariant {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  brandName: string | null;
  categoryName: string;
  unitCode: string;
  unitName: string;
  unitDecimals: number;
  hsnCode: string | null;
  gstRate: string;
  isSample: boolean;
  discountEligible: boolean;
  price: string | null;
  priceIncludesTax: boolean | null;
  mrp: string | null;
  tiers: { minQty: string; price: string }[];
  attributes: Record<string, string>;
  conversions: { unitCode: string; factor: string }[];
}

/** Search active products/variants for the POS, with current prices from the given list. */
export async function searchSellable(
  actor: Actor,
  opts: { q?: string; categoryId?: string; priceListId?: string; limit?: number; variantIds?: string[] },
): Promise<SellableVariant[]> {
  requirePermission(actor, ["sales.create", "catalog.view"]);
  const db = getDb();
  const where: SQL[] = [eq(products.isActive, true), eq(productVariants.isActive, true)];
  const q = opts.q?.trim();
  let exactRank: SQL = sql`0`;
  if (q) {
    const like = `%${q}%`;
    const tokens = q.split(/\s+/).filter(Boolean).slice(0, 6);
    for (const t of tokens) {
      const tl = `%${t}%`;
      where.push(
        or(
          ilike(products.name, tl),
          ilike(productVariants.name, tl),
          ilike(productVariants.sku, tl),
          ilike(brands.name, tl),
          ilike(categories.name, tl),
          ilike(products.model, tl),
          sql`${productVariants.attributes}::text ilike ${tl}`,
          eq(productVariants.barcode, t),
        )!,
      );
    }
    exactRank = sql`case when upper(${productVariants.sku}) = upper(${q}) or ${productVariants.barcode} = ${q} then 2 when ${products.name} ilike ${like} then 1 else 0 end`;
  }
  if (opts.categoryId) where.push(eq(products.categoryId, opts.categoryId));
  if (opts.variantIds?.length) where.push(inArray(productVariants.id, opts.variantIds));

  const rows = await db
    .select({ v: productVariants, p: products, brandName: brands.name, categoryName: categories.name, unit: units })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(units, eq(units.code, productVariants.unitCode))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(and(...where))
    .orderBy(desc(exactRank), asc(products.name), asc(productVariants.sortOrder), asc(productVariants.name))
    .limit(Math.min(opts.limit ?? 40, 200));

  const ids = rows.map((r) => r.v.id);
  const priceListId = opts.priceListId ?? (await getDefaultPriceList()).id;
  const prices = await getActivePrices(ids, priceListId);
  const ctx = await getVariantPricingContext(ids);
  const conv = ids.length ? await db.select().from(variantUnitConversions).where(inArray(variantUnitConversions.variantId, ids)) : [];

  return rows.map((r) => {
    const pv = prices.get(r.v.id);
    const c = ctx.get(r.v.id);
    return {
      variantId: r.v.id,
      productId: r.p.id,
      productName: r.p.name,
      variantName: r.v.name,
      sku: r.v.sku,
      barcode: r.v.barcode,
      brandName: r.brandName,
      categoryName: r.categoryName,
      unitCode: r.unit.code,
      unitName: r.unit.name,
      unitDecimals: r.unit.decimals,
      hsnCode: r.p.hsnCode,
      gstRate: c?.gstRate ?? "0",
      isSample: r.p.isSample,
      discountEligible: c?.discountEligible ?? true,
      price: pv?.price ?? null,
      priceIncludesTax: pv?.priceIncludesTax ?? null,
      mrp: pv?.mrp ?? null,
      tiers: pv?.tiers ?? [],
      attributes: r.v.attributes,
      conversions: conv.filter((x) => x.variantId === r.v.id).map((x) => ({ unitCode: x.unitCode, factor: x.factor })),
    };
  });
}

export { unitPriceForQuantity };
