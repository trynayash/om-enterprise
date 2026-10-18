import "server-only";
/**
 * Public website data access. Every function returns explicitly constructed DTOs containing
 * ONLY public fields: no costs, margins, internal notes, staff names, or unpublished items.
 */
import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { brands, categories, productImages, products, productVariants, units, variantCompatibility } from "@/server/db/schema";
import { getActivePrices, getDefaultPriceList, getVariantPricingContext } from "@/server/services/pricing";
import { getSettings } from "@/server/settings";
import { D, m } from "@/lib/money";

export interface PublicPrice {
  /** What the customer pays per unit (₹, 2dp). */
  amount: string;
  /** e.g. "incl. GST" / "+ GST as applicable" / "" */
  taxLabel: string;
  mrp: string | null;
  tiers: { minQty: string; amount: string }[];
}

export interface PublicVariant {
  id: string;
  sku: string;
  name: string;
  attributes: Record<string, string>;
  unit: string;
  unitCode: string;
  unitDecimals: number;
  price: PublicPrice | null;
}

export interface PublicProductCard {
  slug: string;
  name: string;
  brand: string | null;
  category: string;
  categorySlug: string;
  categoryIcon: string | null;
  image: string | null;
  priceFrom: PublicPrice | null;
  variantCount: number;
  isSample: boolean;
}

const publishedProduct = and(eq(products.isPublished, true), eq(products.isActive, true));
const publishedCategory = and(eq(categories.isPublished, true), eq(categories.isActive, true));

async function priceDisplay() {
  const [tax, website] = await Promise.all([getSettings("tax"), getSettings("website")]);
  return { regType: tax.registrationType, showPrices: website.showPrices };
}

function toPublicPrice(
  pv: { price: string; priceIncludesTax: boolean; mrp: string | null; tiers: { minQty: string; price: string }[] },
  gstRate: string,
  regType: "regular" | "composition" | "unregistered" | null,
): PublicPrice {
  const conv = (p: string) => {
    if (regType === "regular" && !pv.priceIncludesTax) return m(D(p).times(D(100).plus(D(gstRate))).div(100));
    return m(p);
  };
  let taxLabel = "";
  if (regType === "regular") taxLabel = D(gstRate).isZero() ? "" : "incl. GST";
  else if (regType === null) taxLabel = pv.priceIncludesTax ? "incl. taxes" : "+ GST as applicable";
  return {
    amount: conv(pv.price),
    taxLabel,
    mrp: pv.mrp,
    tiers: (pv.tiers ?? []).map((t) => ({ minQty: t.minQty, amount: conv(t.price) })),
  };
}

export async function getPublicCategories() {
  const db = getDb();
  const rows = await db
    .select({
      id: categories.id,
      parentId: categories.parentId,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      icon: categories.icon,
      // Explicitly qualified: drizzle renders `${categories.id}` as a bare "id" in single-table selects,
      // which inside this subquery would bind to products.id.
      productCount: sql<number>`(select count(*)::int from products p where p.category_id = "categories"."id" and p.is_published and p.is_active)`,
    })
    .from(categories)
    .where(publishedCategory)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return rows;
}

export async function getPublicBrands() {
  const db = getDb();
  return db
    .select({ name: brands.name, slug: brands.slug })
    .from(brands)
    .where(and(eq(brands.isActive, true), sql`exists (select 1 from products p where p.brand_id = ${brands.id} and p.is_published and p.is_active)`))
    .orderBy(asc(brands.name));
}

export interface PublicSearch {
  q?: string;
  category?: string;
  brand?: string;
  sort?: "name" | "price_asc" | "price_desc";
  page?: number;
  pageSize?: number;
  featured?: boolean;
}

export async function searchPublicProducts(s: PublicSearch): Promise<{ items: PublicProductCard[]; total: number; page: number; pageSize: number }> {
  const db = getDb();
  const where: SQL[] = [publishedProduct!, publishedCategory!];
  if (s.q?.trim()) {
    for (const t of s.q.trim().split(/\s+/).slice(0, 6)) {
      const like = `%${t}%`;
      where.push(
        or(
          ilike(products.name, like),
          ilike(brands.name, like),
          ilike(categories.name, like),
          ilike(products.model, like),
          sql`exists (select 1 from product_variants pv where pv.product_id = ${products.id} and pv.is_active and (pv.name ilike ${like} or pv.sku ilike ${like}))`,
        )!,
      );
    }
  }
  if (s.category) {
    // include sub-categories one level down
    where.push(
      sql`(${categories.slug} = ${s.category} or ${categories.parentId} in (select id from categories where slug = ${s.category}))`,
    );
  }
  if (s.brand) where.push(eq(brands.slug, s.brand));
  if (s.featured) where.push(eq(products.isFeatured, true));

  const pageSize = Math.min(s.pageSize ?? 24, 60);
  const page = Math.max(1, s.page ?? 1);
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      brand: brands.name,
      category: categories.name,
      categorySlug: categories.slug,
      categoryIcon: categories.icon,
      isSample: products.isSample,
      total: sql<number>`count(*) over ()::int`,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(and(...where))
    .orderBy(s.featured ? sql`${products.updatedAt} desc` : asc(products.name))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const productIds = rows.map((r) => r.id);
  const variants = productIds.length
    ? await db
        .select({ id: productVariants.id, productId: productVariants.productId })
        .from(productVariants)
        .where(and(inArray(productVariants.productId, productIds), eq(productVariants.isActive, true)))
    : [];
  const images = productIds.length
    ? await db
        .selectDistinctOn([productImages.productId], { productId: productImages.productId, url: productImages.url })
        .from(productImages)
        .where(inArray(productImages.productId, productIds))
        .orderBy(productImages.productId, asc(productImages.sortOrder))
    : [];
  const { regType, showPrices } = await priceDisplay();
  const list = await getDefaultPriceList();
  const vIds = variants.map((v) => v.id);
  const prices = showPrices ? await getActivePrices(vIds, list.id) : new Map();
  const ctx = showPrices ? await getVariantPricingContext(vIds) : new Map();

  const items: PublicProductCard[] = rows.map((r) => {
    const vs = variants.filter((v) => v.productId === r.id);
    let best: PublicPrice | null = null;
    for (const v of vs) {
      const pv = prices.get(v.id);
      if (!pv) continue;
      const pp = toPublicPrice(pv, ctx.get(v.id)?.gstRate ?? "0", regType);
      if (!best || D(pp.amount).lessThan(D(best.amount))) best = pp;
    }
    return {
      slug: r.slug,
      name: r.name,
      brand: r.brand,
      category: r.category,
      categorySlug: r.categorySlug,
      categoryIcon: r.categoryIcon,
      image: images.find((i) => i.productId === r.id)?.url ?? null,
      priceFrom: best,
      variantCount: vs.length,
      isSample: r.isSample,
    };
  });
  if (s.sort === "price_asc" || s.sort === "price_desc") {
    const dir = s.sort === "price_asc" ? 1 : -1;
    items.sort((a, b) => {
      if (!a.priceFrom) return 1;
      if (!b.priceFrom) return -1;
      return dir * D(a.priceFrom.amount).comparedTo(D(b.priceFrom.amount));
    });
  }
  return { items, total: rows[0]?.total ?? 0, page, pageSize };
}

export async function getPublicProduct(slug: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      description: products.description,
      specifications: products.specifications,
      variantAttributes: products.variantAttributes,
      warrantyInfo: products.warrantyInfo,
      manufacturer: products.manufacturer,
      model: products.model,
      isSample: products.isSample,
      brand: brands.name,
      brandSlug: brands.slug,
      category: categories.name,
      categorySlug: categories.slug,
      categoryIcon: categories.icon,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(and(eq(products.slug, slug), publishedProduct, publishedCategory));
  const p = rows[0];
  if (!p) return null;

  const vs = await db
    .select({ v: productVariants, unitName: units.name, unitDecimals: units.decimals })
    .from(productVariants)
    .innerJoin(units, eq(units.code, productVariants.unitCode))
    .where(and(eq(productVariants.productId, p.id), eq(productVariants.isActive, true)))
    .orderBy(asc(productVariants.sortOrder), asc(productVariants.name));
  const ids = vs.map((x) => x.v.id);
  const { regType, showPrices } = await priceDisplay();
  const list = await getDefaultPriceList();
  const prices = showPrices ? await getActivePrices(ids, list.id) : new Map();
  const ctx = await getVariantPricingContext(ids);
  const images = await db
    .select({ url: productImages.url, alt: productImages.alt, variantId: productImages.variantId })
    .from(productImages)
    .where(eq(productImages.productId, p.id))
    .orderBy(asc(productImages.sortOrder));

  // Compatible items (only published ones)
  const compat = ids.length
    ? await db
        .select({ a: variantCompatibility.variantA, b: variantCompatibility.variantB, note: variantCompatibility.note })
        .from(variantCompatibility)
        .where(or(inArray(variantCompatibility.variantA, ids), inArray(variantCompatibility.variantB, ids)))
    : [];
  const otherIds = [...new Set(compat.flatMap((c) => [c.a, c.b]).filter((x) => !ids.includes(x)))];
  const compatible = otherIds.length
    ? await db
        .select({ variantId: productVariants.id, variantName: productVariants.name, productName: products.name, slug: products.slug })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(and(inArray(productVariants.id, otherIds), eq(productVariants.isActive, true), publishedProduct))
    : [];

  const variants: PublicVariant[] = vs.map(({ v, unitName, unitDecimals }) => {
    const pv = prices.get(v.id);
    return {
      id: v.id,
      sku: v.sku,
      name: v.name,
      attributes: v.attributes,
      unit: unitName,
      unitCode: v.unitCode,
      unitDecimals,
      price: pv ? toPublicPrice(pv, ctx.get(v.id)?.gstRate ?? "0", regType) : null,
    };
  });

  return {
    ...p,
    images,
    variants,
    compatible: compatible.map((c) => ({
      ...c,
      note: compat.find((x) => x.a === c.variantId || x.b === c.variantId)?.note ?? null,
    })),
  };
}

/** Server-side re-pricing for website cart / order requests (client prices are never trusted). */
export async function pricePublicCart(items: { variantId: string; quantity: string }[]) {
  const db = getDb();
  const ids = [...new Set(items.map((i) => i.variantId))];
  if (!ids.length) return { lines: [], total: "0.00", allPriced: true };
  const vs = await db
    .select({ v: productVariants, p: products, unitName: units.name, unitDecimals: units.decimals })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(units, eq(units.code, productVariants.unitCode))
    .where(and(inArray(productVariants.id, ids), eq(productVariants.isActive, true), publishedProduct));
  const { regType, showPrices } = await priceDisplay();
  const list = await getDefaultPriceList();
  const prices = showPrices ? await getActivePrices(ids, list.id) : new Map();
  const ctx = await getVariantPricingContext(ids);
  let total = D(0);
  let allPriced = true;
  const lines = items.flatMap((it) => {
    const row = vs.find((x) => x.v.id === it.variantId);
    if (!row) return [];
    const q = D(it.quantity);
    const decimals = row.unitDecimals;
    if (q.lessThanOrEqualTo(0) || q.decimalPlaces() > decimals) return [];
    const pv = prices.get(row.v.id);
    let unit: string | null = null;
    if (pv) {
      const pp = toPublicPrice(pv, ctx.get(row.v.id)?.gstRate ?? "0", regType);
      let chosen = pp.amount;
      for (const t of pp.tiers) if (q.greaterThanOrEqualTo(D(t.minQty))) chosen = t.amount;
      unit = chosen;
      total = total.plus(D(chosen).times(q));
    } else allPriced = false;
    return [
      {
        variantId: row.v.id,
        sku: row.v.sku,
        productName: row.p.name,
        variantName: row.v.name,
        unit: row.unitName,
        quantity: q.toString(),
        unitPrice: unit,
        lineTotal: unit ? m(D(unit).times(q)) : null,
        priceIncludesTax: pv?.priceIncludesTax ?? null,
        isSample: row.p.isSample,
      },
    ];
  });
  return { lines, total: m(total), allPriced };
}
