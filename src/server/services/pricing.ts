import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, type Tx } from "@/server/db/client";
import {
  brands,
  categories,
  priceLists,
  products,
  productVariants,
  taxClasses,
  users,
  variantCosts,
  variantPrices,
  type PriceTier,
} from "@/server/db/schema";
import { audit, auditMany, type AuditEntry } from "@/server/audit";
import { auditActorOf, can, requirePermission, type Actor } from "@/server/auth/actor";
import { conflict, forbidden, invalid, notFound } from "@/server/errors";
import { getSettings } from "@/server/settings";
import { D, Dec, m } from "@/lib/money";
import { grossMarginPercent, landedUnitCost, toTaxExclusive } from "@/lib/pricing/engine";
import type { PendingPriceFilter, PriceSource } from "@/lib/price-filters";

export type PriceVersion = typeof variantPrices.$inferSelect;
export type CostVersion = typeof variantCosts.$inferSelect;

export async function getDefaultPriceList(tx?: Tx) {
  const db = tx ?? getDb();
  const [pl] = await db.select().from(priceLists).where(eq(priceLists.isDefault, true));
  if (!pl) throw new Error("No default price list configured");
  return pl;
}

/** Active (approved, effective) price versions for many variants on one list, at `at`. */
export async function getActivePrices(
  variantIds: string[],
  priceListId: string,
  at: Date = new Date(),
  tx?: Tx,
): Promise<Map<string, PriceVersion>> {
  const out = new Map<string, PriceVersion>();
  if (!variantIds.length) return out;
  const db = tx ?? getDb();
  const rows = await db
    .selectDistinctOn([variantPrices.variantId])
    .from(variantPrices)
    .where(
      and(
        inArray(variantPrices.variantId, variantIds),
        eq(variantPrices.priceListId, priceListId),
        eq(variantPrices.status, "approved"),
        lte(variantPrices.effectiveFrom, at),
      ),
    )
    .orderBy(variantPrices.variantId, desc(variantPrices.effectiveFrom), desc(variantPrices.createdAt));
  for (const r of rows) out.set(r.variantId, r);
  return out;
}

export async function getActiveCosts(variantIds: string[], at: Date = new Date(), tx?: Tx): Promise<Map<string, CostVersion>> {
  const out = new Map<string, CostVersion>();
  if (!variantIds.length) return out;
  const db = tx ?? getDb();
  const rows = await db
    .selectDistinctOn([variantCosts.variantId])
    .from(variantCosts)
    .where(and(inArray(variantCosts.variantId, variantIds), lte(variantCosts.effectiveFrom, at)))
    .orderBy(variantCosts.variantId, desc(variantCosts.effectiveFrom), desc(variantCosts.createdAt));
  for (const r of rows) out.set(r.variantId, r);
  return out;
}

/** Unit price for a quantity, applying quantity tiers (highest tier whose minQty ≤ qty). */
export function unitPriceForQuantity(version: Pick<PriceVersion, "price" | "tiers">, quantity: string): {
  price: string;
  tier: PriceTier | null;
} {
  const q = D(quantity);
  let best: PriceTier | null = null;
  for (const t of version.tiers ?? []) {
    if (q.greaterThanOrEqualTo(D(t.minQty)) && (!best || D(t.minQty).greaterThan(D(best.minQty)))) best = t;
  }
  return { price: best ? D(best.price).toFixed(2) : D(version.price).toFixed(2), tier: best };
}

export interface VariantPricingContext {
  variantId: string;
  productId: string;
  gstRate: string;
  cessRate: string;
  taxClassId: string | null;
  isExempt: boolean;
  categoryId: string;
  minMarginPercent: string | null;
  targetMarginPercent: string | null;
  discountEligible: boolean;
}

/** Tax class + margin rules resolved for variants (variant → product → category → global). */
export async function getVariantPricingContext(variantIds: string[], tx?: Tx): Promise<Map<string, VariantPricingContext>> {
  const db = tx ?? getDb();
  const out = new Map<string, VariantPricingContext>();
  if (!variantIds.length) return out;
  const vTax = alias(taxClasses, "v_tax");
  const pTax = alias(taxClasses, "p_tax");
  const rows = await db
    .select({
      v: productVariants,
      p: products,
      c: categories,
      vTax,
      pTax,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(vTax, eq(vTax.id, productVariants.taxClassId))
    .leftJoin(pTax, eq(pTax.id, products.taxClassId))
    .where(inArray(productVariants.id, variantIds));
  const discounts = await getSettings("discounts", tx);
  for (const r of rows) {
    const tc = r.vTax ?? r.pTax;
    out.set(r.v.id, {
      variantId: r.v.id,
      productId: r.p.id,
      gstRate: tc?.gstRate ?? "0",
      cessRate: tc?.cessRate ?? "0",
      taxClassId: tc?.id ?? null,
      isExempt: tc?.isExempt ?? false,
      categoryId: r.c.id,
      minMarginPercent: r.v.minMarginPercent ?? r.c.minMarginPercent ?? (discounts.minMarginPercent || null),
      targetMarginPercent: r.v.targetMarginPercent ?? r.c.targetMarginPercent ?? (discounts.targetMarginPercent || null),
      discountEligible: r.v.discountEligible ?? r.p.discountEligible,
    });
  }
  return out;
}

/**
 * Input tax credit is recoverable for regular GST registration. While the registration type is
 * still unconfirmed, sales are previewed WITH GST (as a regular registrant), so costs are treated
 * the same way for consistent margins. Composition / unregistered businesses cannot claim ITC,
 * so purchase GST is part of their cost.
 */
export function itcPolicyFor(registrationType: "regular" | "composition" | "unregistered" | null): "recoverable" | "non_recoverable" {
  return registrationType === "composition" || registrationType === "unregistered" ? "non_recoverable" : "recoverable";
}

async function itcPolicyFromSettings(tx?: Tx): Promise<"recoverable" | "non_recoverable"> {
  return itcPolicyFor((await getSettings("tax", tx)).registrationType);
}

function marginFor(price: string, includesTax: boolean, gstRate: string, cessRate: string, landed: string | null, taxMode: "charged" | "none") {
  if (!landed) return null;
  const excl = taxMode === "none" ? D(price) : toTaxExclusive(price, includesTax, gstRate, cessRate);
  return grossMarginPercent(excl, landed);
}

/* ------------------------------------------------------------------ */
/* Price changes                                                       */
/* ------------------------------------------------------------------ */

export async function proposePrice(
  actor: Actor,
  input: {
    variantId: string;
    priceListId?: string;
    price: string;
    priceIncludesTax: boolean;
    mrp?: string | null;
    tiers?: PriceTier[];
    effectiveFrom?: string | null;
    reason: string;
    /** Leave the proposal pending even for an approver (e.g. imported list prices awaiting review). */
    requireApproval?: boolean;
  },
) {
  requirePermission(actor, "prices.edit");
  const db = getDb();
  const pricingSettings = await getSettings("pricing");
  const taxSettings = await getSettings("tax");
  return db.transaction(async (tx) => {
    const priceList = input.priceListId
      ? (await tx.select().from(priceLists).where(eq(priceLists.id, input.priceListId)))[0]
      : await getDefaultPriceList(tx);
    if (!priceList) throw notFound("Price list");
    const [variant] = await tx.select().from(productVariants).where(eq(productVariants.id, input.variantId));
    if (!variant) throw notFound("Variant");

    const now = new Date();
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : now;
    if (effectiveFrom.getTime() < now.getTime() - 60_000) {
      throw invalid("Price changes cannot be back-dated; choose now or a future date");
    }

    const ctx = (await getVariantPricingContext([variant.id], tx)).get(variant.id)!;
    const price = D(input.price);
    const inclusivePrice = input.priceIncludesTax ? price : price.times(D(100).plus(D(ctx.gstRate))).div(100);
    if (input.mrp && inclusivePrice.greaterThan(D(input.mrp))) {
      throw invalid(`Selling price (₹${m(inclusivePrice)} incl. tax) cannot exceed the MRP ₹${m(input.mrp)}`);
    }
    const tiers = (input.tiers ?? [])
      .map((t) => ({ minQty: D(t.minQty).toString(), price: m(t.price) }))
      .sort((a, b) => D(a.minQty).comparedTo(D(b.minQty)));
    for (const t of tiers) {
      if (D(t.minQty).lessThanOrEqualTo(1)) throw invalid("Quantity-break tiers must start above 1 unit");
      if (D(t.price).greaterThan(price)) throw invalid("A quantity-break price cannot be higher than the base price");
    }

    const current = (await getActivePrices([variant.id], priceList.id, now, tx)).get(variant.id) ?? null;
    const cost = (await getActiveCosts([variant.id], now, tx)).get(variant.id) ?? null;
    const taxMode = taxSettings.registrationType === "composition" || taxSettings.registrationType === "unregistered" ? "none" : "charged";
    const newMargin = marginFor(m(price), input.priceIncludesTax, ctx.gstRate, ctx.cessRate, cost?.landedCost ?? null, taxMode);
    const prevMargin = current
      ? marginFor(current.price, current.priceIncludesTax, ctx.gstRate, ctx.cessRate, cost?.landedCost ?? null, taxMode)
      : null;

    const autoApprove = !input.requireApproval && (can(actor, "prices.approve") || !pricingSettings.priceChangeRequiresApproval);
    // A new proposal supersedes older pending ones for the same variant & list.
    const superseded = await tx
      .update(variantPrices)
      .set({ status: "cancelled", decidedBy: actor.id, decidedAt: now, decisionNote: "Superseded by a newer proposal" })
      .where(
        and(
          eq(variantPrices.variantId, variant.id),
          eq(variantPrices.priceListId, priceList.id),
          eq(variantPrices.status, "pending"),
        ),
      )
      .returning({ id: variantPrices.id });

    const [row] = await tx
      .insert(variantPrices)
      .values({
        variantId: variant.id,
        priceListId: priceList.id,
        price: m(price),
        priceIncludesTax: input.priceIncludesTax,
        mrp: input.mrp ? m(input.mrp) : null,
        tiers,
        effectiveFrom,
        status: autoApprove ? "approved" : "pending",
        reason: input.reason,
        previousVersionId: current?.id ?? null,
        previousPrice: current?.price ?? null,
        landedCostSnapshot: cost?.landedCost ?? null,
        marginPercentSnapshot: newMargin ? newMargin.toFixed(2) : null,
        previousMarginPercent: prevMargin ? prevMargin.toFixed(2) : null,
        createdBy: actor.id,
        decidedBy: autoApprove ? actor.id : null,
        decidedAt: autoApprove ? now : null,
        decisionNote: autoApprove ? "Approved on entry (authorised user)" : null,
      })
      .returning();

    await audit(tx, auditActorOf(actor), {
      action: autoApprove ? "price.change" : "price.change_requested",
      entityType: "variant",
      entityId: variant.id,
      summary: `${autoApprove ? "Set" : "Proposed"} ${priceList.name} price of ${variant.sku}: ${
        current ? `₹${current.price}` : "none"
      } → ₹${row.price}${input.priceIncludesTax ? " incl. tax" : " + tax"}${
        effectiveFrom > now ? ` from ${effectiveFrom.toISOString()}` : ""
      }`,
      data: {
        priceVersionId: row.id,
        previousPrice: current?.price ?? null,
        newPrice: row.price,
        mrp: row.mrp,
        tiers,
        landedCost: cost?.landedCost ?? null,
        previousMarginPercent: row.previousMarginPercent,
        newMarginPercent: row.marginPercentSnapshot,
        reason: input.reason,
        supersededPending: superseded.map((s) => s.id),
      },
    });
    return row;
  });
}

export async function decidePriceChange(actor: Actor, versionId: string, decision: "approve" | "reject", note?: string) {
  requirePermission(actor, "prices.approve");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [v] = await tx.select().from(variantPrices).where(eq(variantPrices.id, versionId)).for("update");
    if (!v) throw notFound("Price change");
    if (v.status !== "pending") throw conflict(`This price change is already ${v.status}`);
    const now = new Date();
    const status = decision === "approve" ? "approved" : "rejected";
    // An approval of a back-dated pending price takes effect now, not in the past.
    const [row] = await tx
      .update(variantPrices)
      .set({ status, decidedBy: actor.id, decidedAt: now, decisionNote: note ?? null })
      .where(eq(variantPrices.id, versionId))
      .returning();
    const [variant] = await tx.select({ sku: productVariants.sku }).from(productVariants).where(eq(productVariants.id, v.variantId));
    await audit(tx, auditActorOf(actor), priceDecisionEntry(v, variant?.sku, decision, note ?? null));
    // Whether this price is now the one in force: a later approved price, or a start date still
    // to come, means it is not (yet).
    const live = decision === "approve" && (await getActivePrices([v.variantId], v.priceListId, now, tx)).get(v.variantId)?.id === v.id;
    return { ...row, live };
  });
}

/** The audit record of one price decision. Single and bulk decisions both use it, so their records match. */
function priceDecisionEntry(
  v: Pick<PriceVersion, "id" | "variantId" | "previousPrice" | "price" | "createdBy">,
  sku: string | undefined,
  decision: "approve" | "reject",
  note: string | null,
  extra?: Record<string, unknown>,
): AuditEntry {
  return {
    action: decision === "approve" ? "price.change_approved" : "price.change_rejected",
    entityType: "variant",
    entityId: v.variantId,
    summary: `${decision === "approve" ? "Approved" : "Rejected"} price change for ${sku}: ₹${v.previousPrice ?? "—"} → ₹${v.price}`,
    data: { priceVersionId: v.id, note, requestedBy: v.createdBy, ...extra },
  };
}

export async function cancelScheduledPrice(actor: Actor, versionId: string, reason: string) {
  requirePermission(actor, "prices.approve");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [v] = await tx.select().from(variantPrices).where(eq(variantPrices.id, versionId));
    if (!v) throw notFound("Price version");
    if (!(v.status === "pending" || (v.status === "approved" && v.effectiveFrom > new Date()))) {
      throw conflict("Only pending or not-yet-effective prices can be cancelled");
    }
    await tx
      .update(variantPrices)
      .set({ status: "cancelled", decidedBy: actor.id, decidedAt: new Date(), decisionNote: reason })
      .where(eq(variantPrices.id, versionId));
    await audit(tx, auditActorOf(actor), {
      action: "price.change_cancelled",
      entityType: "variant",
      entityId: v.variantId,
      summary: `Cancelled scheduled/pending price ₹${v.price}`,
      data: { priceVersionId: v.id, reason },
    });
  });
}

/** Strip cost/margin snapshots from price versions for users without costs.view. */
export function redactPriceVersion<T extends Partial<PriceVersion>>(actor: Actor, v: T): T {
  if (can(actor, "costs.view")) return v;
  return { ...v, landedCostSnapshot: null, marginPercentSnapshot: null, previousMarginPercent: null };
}

export async function listPendingPriceChanges(actor: Actor) {
  const db = getDb();
  const creator = alias(users, "creator");
  return db
    .select({
      version: variantPrices,
      sku: productVariants.sku,
      variantName: productVariants.name,
      productName: products.name,
      productId: products.id,
      listName: priceLists.name,
      requestedBy: creator.displayName,
    })
    .from(variantPrices)
    .innerJoin(productVariants, eq(productVariants.id, variantPrices.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(priceLists, eq(priceLists.id, variantPrices.priceListId))
    .innerJoin(creator, eq(creator.id, variantPrices.createdBy))
    .where(eq(variantPrices.status, "pending"))
    .orderBy(desc(variantPrices.createdAt))
    .then((rows) => rows.map((r) => ({ ...r, version: redactPriceVersion(actor, r.version) })));
}

/** How many price changes wait for approval (dashboard home and sidebar). */
export async function countPendingPriceChanges(): Promise<number> {
  const [r] = await getDb().select({ c: sql<number>`count(*)::int` }).from(variantPrices).where(eq(variantPrices.status, "pending"));
  return r?.c ?? 0;
}

/* ------------------------------------------------------------------ */
/* Prices waiting for approval: search and decisions in bulk           */
/* ------------------------------------------------------------------ */

const pendingVTax = alias(taxClasses, "pending_v_tax");
const pendingPTax = alias(taxClasses, "pending_p_tax");
const pendingPrev = alias(variantPrices, "pending_prev");
const pendingGst = sql`coalesce(${pendingVTax.gstRate}, ${pendingPTax.gstRate}, 0)`;
/** The proposed price, including GST. */
const pendingPriceIncl = sql`(case when ${variantPrices.priceIncludesTax} then ${variantPrices.price} else round(${variantPrices.price} * (100 + ${pendingGst}) / 100, 2) end)`;
/** The price it replaces, on the basis that one was set (incl. or excl. GST), including GST. */
const pendingPrevIncl = sql`(case when coalesce(${pendingPrev.priceIncludesTax}, ${variantPrices.priceIncludesTax}) then ${variantPrices.previousPrice} else round(${variantPrices.previousPrice} * (100 + ${pendingGst}) / 100, 2) end)`;
const pendingChangePct = sql`(case when ${pendingPrevIncl} > 0 then round((${pendingPriceIncl} - ${pendingPrevIncl}) * 100 / ${pendingPrevIncl}, 1) end)`;
const pendingDirection = sql`(case when ${variantPrices.previousPrice} is null then 'new' when ${pendingPriceIncl} > ${pendingPrevIncl} then 'up' when ${pendingPriceIncl} < ${pendingPrevIncl} then 'down' else 'same' end)`;
/** Where a proposal came from, read from its reason (the catalogue import and bulk import write fixed prefixes). */
const pendingSource = sql`(case when ${variantPrices.reason} like 'Manufacturer list price:%' then 'list' when ${variantPrices.reason} like 'Market price (researched):%' then 'market' when ${variantPrices.reason} like 'Bulk import%' or ${variantPrices.importBatchId} is not null then 'import' else 'manual' end)`;

function pendingConditions(f: PendingPriceFilter): SQL[] {
  const where: SQL[] = [eq(variantPrices.status, "pending")];
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, "\\$&")}%`;
    where.push(or(ilike(products.name, like), ilike(productVariants.name, like), ilike(productVariants.sku, like))!);
  }
  if (f.brandId) where.push(f.brandId === "none" ? isNull(products.brandId) : eq(products.brandId, f.brandId));
  if (f.categoryId) {
    // The category and every category below it.
    where.push(
      sql`${products.categoryId} in (with recursive cat_tree(id) as (select c.id from categories c where c.id = ${f.categoryId} union select c.id from categories c join cat_tree t on c.parent_id = t.id) select id from cat_tree)`,
    );
  }
  if (f.source) where.push(sql`${pendingSource} = ${f.source}`);
  if (f.change) where.push(sql`${pendingDirection} = ${f.change}`);
  if (f.min) where.push(sql`${pendingPriceIncl} >= ${f.min}::numeric`);
  if (f.max) where.push(sql`${pendingPriceIncl} <= ${f.max}::numeric`);
  if (f.importBatchId) where.push(eq(variantPrices.importBatchId, f.importBatchId));
  return where;
}

/** The pending price versions matching a filter, with the values the list sorts and sums by. */
function matchingPending(f: PendingPriceFilter) {
  const db = getDb();
  return db.$with("pending_match").as(
    db
      .select({
        id: variantPrices.id,
        createdAt: variantPrices.createdAt,
        reason: variantPrices.reason,
        productName: sql<string>`${products.name}`.as("product_name"),
        variantName: sql<string>`${productVariants.name}`.as("variant_name"),
        sku: sql<string>`${productVariants.sku}`.as("variant_sku"),
        brandId: sql<string | null>`${products.brandId}`.as("brand_id"),
        brandName: sql<string | null>`${brands.name}`.as("brand_name"),
        categoryName: sql<string>`${categories.name}`.as("category_name"),
        priceIncl: sql<string>`${pendingPriceIncl}`.as("price_incl"),
        changePct: sql<string | null>`${pendingChangePct}`.as("change_pct"),
        direction: sql<"new" | "up" | "down" | "same">`${pendingDirection}`.as("direction"),
        source: sql<PriceSource>`${pendingSource}`.as("source"),
      })
      .from(variantPrices)
      .innerJoin(productVariants, eq(productVariants.id, variantPrices.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .leftJoin(pendingVTax, eq(pendingVTax.id, productVariants.taxClassId))
      .leftJoin(pendingPTax, eq(pendingPTax.id, products.taxClassId))
      .leftJoin(pendingPrev, eq(pendingPrev.id, variantPrices.previousVersionId))
      .where(and(...pendingConditions(f))),
  );
}

async function brandCounts(m: ReturnType<typeof matchingPending>) {
  const n = sql<number>`count(*)::int`;
  const rows = await getDb()
    .with(m)
    .select({ brandId: m.brandId, name: m.brandName, count: n })
    .from(m)
    .groupBy(m.brandId, m.brandName)
    .orderBy(desc(n), asc(m.brandName));
  return rows.map((r) => ({ brandId: r.brandId, name: r.name ?? "No brand", count: r.count }));
}

/**
 * One page of the prices waiting for approval, filtered and sorted in the database, with a summary of
 * everything that matches. `asOf` is the newest matching proposal: deciding "all" uses it, so a
 * proposal that arrives after the page was shown is never decided unseen.
 */
export async function searchPendingPriceChanges(actor: Actor, filter: PendingPriceFilter, opts: { page?: number; pageSize?: number } = {}) {
  requirePermission(actor, ["prices.edit", "prices.approve"]);
  const db = getDb();
  const m = matchingPending(filter);
  const n = sql<number>`count(*)::int`;
  const [agg] = await db
    .with(m)
    .select({
      total: n,
      newPrices: sql<number>`(count(*) filter (where ${m.direction} = 'new'))::int`,
      increases: sql<number>`(count(*) filter (where ${m.direction} = 'up'))::int`,
      decreases: sql<number>`(count(*) filter (where ${m.direction} = 'down'))::int`,
      noteCount: sql<number>`count(distinct split_part(${m.reason}, ';', 1))::int`,
      // Rounded up to the millisecond, as a JavaScript date can't hold microseconds.
      newestMs: sql<string | null>`ceil(extract(epoch from max(${m.createdAt})) * 1000)::bigint::text`,
    })
    .from(m);
  const total = agg?.total ?? 0;
  const sources = total ? await db.with(m).select({ source: m.source, count: n }).from(m).groupBy(m.source).orderBy(desc(n), asc(m.source)) : [];
  const brandsInView = total ? await brandCounts(m) : [];
  // The brand list offers every brand under the other filters, so another brand can be picked. The
  // chosen brand stays in the list (with 0) once everything in it has been decided.
  const brandOptions = filter.brandId ? await brandCounts(matchingPending({ ...filter, brandId: undefined })) : brandsInView;
  if (filter.brandId && filter.brandId !== "none" && !brandOptions.some((b) => b.brandId === filter.brandId)) {
    const [chosen] = await db.select({ name: brands.name }).from(brands).where(eq(brands.id, filter.brandId));
    if (chosen) brandOptions.unshift({ brandId: filter.brandId, name: chosen.name, count: 0 });
  }
  // Reasons grouped by their text before the first ";" — a price list's lines differ only in the
  // page or code after it ("… PL_012026, effective 5 May 2025; p. 3").
  const reasonHead = sql<string>`split_part(${m.reason}, ';', 1)`;
  const notes = total ? await db.with(m).select({ reason: reasonHead, count: n }).from(m).groupBy(reasonHead).orderBy(desc(n), asc(reasonHead)).limit(6) : [];

  const pageSize = Math.min(Math.max(1, Math.floor(opts.pageSize ?? 25)), 200);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1)), pages);
  const order = {
    newest: [desc(m.createdAt), desc(m.id)],
    product: [asc(m.productName), asc(m.variantName), asc(m.sku), asc(m.id)],
    price_asc: [asc(m.priceIncl), asc(m.id)],
    price_desc: [desc(m.priceIncl), desc(m.id)],
    change: [sql`abs(${m.changePct}) desc nulls last`, asc(m.id)],
  }[filter.sort ?? "newest"];
  const creator = alias(users, "creator");
  const rows = total
    ? await db
        .with(m)
        .select({
          version: variantPrices,
          sku: productVariants.sku,
          variantName: productVariants.name,
          productName: products.name,
          productId: products.id,
          listName: priceLists.name,
          requestedBy: creator.displayName,
          brandName: m.brandName,
          categoryName: m.categoryName,
          priceInclGst: m.priceIncl,
          changePct: m.changePct,
          source: m.source,
        })
        .from(m)
        .innerJoin(variantPrices, eq(variantPrices.id, m.id))
        .innerJoin(productVariants, eq(productVariants.id, variantPrices.variantId))
        .innerJoin(products, eq(products.id, productVariants.productId))
        .innerJoin(priceLists, eq(priceLists.id, variantPrices.priceListId))
        .innerJoin(creator, eq(creator.id, variantPrices.createdBy))
        .orderBy(...order)
        .limit(pageSize)
        .offset((page - 1) * pageSize)
    : [];
  return {
    total,
    page,
    pageSize,
    items: rows.map((r) => ({ ...r, version: redactPriceVersion(actor, r.version) })),
    summary: {
      total,
      newPrices: agg?.newPrices ?? 0,
      increases: agg?.increases ?? 0,
      decreases: agg?.decreases ?? 0,
      sources,
      brands: brandsInView,
      /** The most common reasons given, as written, and how many different ones there are. */
      notes,
      noteCount: agg?.noteCount ?? 0,
    },
    brandOptions,
    asOf: agg?.newestMs ? new Date(Number(agg.newestMs)) : new Date(),
  };
}

export type PendingPriceSearch = Awaited<ReturnType<typeof searchPendingPriceChanges>>;

/** The most prices decided by one "Approve all" / "Reject all". */
export const MAX_BULK_PRICE_DECISIONS = 5000;
const BULK_CHUNK = 200;

/**
 * Approve or reject every pending price matching `filter` that was proposed at or before `asOf`.
 * Works in chunks, one transaction each; a row someone else is deciding at the same moment is
 * skipped, not waited for. Each price gets the same audit record as a single decision, plus one
 * summary record for the whole action.
 */
export async function decidePriceChanges(
  actor: Actor,
  input: { decision: "approve" | "reject"; note?: string | null; filter: PendingPriceFilter; asOf: Date },
) {
  requirePermission(actor, "prices.approve");
  const note = input.note?.trim() || null;
  if (input.decision === "reject" && (!note || note.length < 3)) throw invalid("Give a reason for rejecting these prices (at least 3 characters)");
  if (note && note.length > 300) throw invalid("Keep the note to 300 characters or fewer");
  if (Number.isNaN(input.asOf.getTime())) throw invalid("The time of the list is not valid; reload the page");
  const db = getDb();
  const m = matchingPending(input.filter);
  const found = await db
    .with(m)
    .select({ id: m.id })
    .from(m)
    .where(lte(m.createdAt, input.asOf))
    .orderBy(asc(m.createdAt), asc(m.id))
    .limit(MAX_BULK_PRICE_DECISIONS + 1);
  if (found.length > MAX_BULK_PRICE_DECISIONS) {
    throw invalid(`More than ${MAX_BULK_PRICE_DECISIONS.toLocaleString("en-IN")} prices match. Narrow the list with the filters and decide it in parts.`);
  }
  const ids = found.map((r) => r.id);
  const batchId = randomUUID();
  const status = input.decision === "approve" ? "approved" : "rejected";
  const who = auditActorOf(actor);
  const decided: { id: string; variantId: string; priceListId: string; effectiveFrom: Date; sku: string }[] = [];
  let failure: unknown = null;
  try {
    for (let i = 0; i < ids.length; i += BULK_CHUNK) {
      const chunk = ids.slice(i, i + BULK_CHUNK);
      const done = await db.transaction(async (tx) => {
        const locked = await tx
          .select({ id: variantPrices.id, sku: productVariants.sku })
          .from(variantPrices)
          .innerJoin(productVariants, eq(productVariants.id, variantPrices.variantId))
          .where(and(inArray(variantPrices.id, chunk), eq(variantPrices.status, "pending")))
          .orderBy(asc(variantPrices.id))
          .for("update", { of: variantPrices, skipLocked: true });
        if (!locked.length) return [];
        const skuOf = new Map(locked.map((l) => [l.id, l.sku]));
        const rows = await tx
          .update(variantPrices)
          .set({ status, decidedBy: actor.id, decidedAt: new Date(), decisionNote: note })
          .where(and(inArray(variantPrices.id, [...skuOf.keys()]), eq(variantPrices.status, "pending")))
          .returning();
        await auditMany(
          tx,
          who,
          rows.map((v) => priceDecisionEntry(v, skuOf.get(v.id), input.decision, note, { batchId, bulk: true })),
        );
        return rows.map((v) => ({ id: v.id, variantId: v.variantId, priceListId: v.priceListId, effectiveFrom: v.effectiveFrom, sku: skuOf.get(v.id) ?? "" }));
      });
      decided.push(...done);
    }
  } catch (err) {
    failure = err;
  }
  const skipped = ids.length - decided.length;
  if (ids.length) {
    // Written even when a chunk failed, so the record says how far it got.
    try {
      const lists = [...new Set(decided.map((d) => d.priceListId))];
      await db.transaction((tx) =>
        audit(tx, who, {
          action: input.decision === "approve" ? "price.bulk_approved" : "price.bulk_rejected",
          entityType: "price_list",
          entityId: lists.length === 1 ? lists[0] : null,
          summary: `${input.decision === "approve" ? "Approved" : "Rejected"} ${decided.length} price change${decided.length === 1 ? "" : "s"} at once${skipped ? ` (${skipped} skipped)` : ""}`,
          data: { batchId, decided: decided.length, skipped, note, filter: input.filter, asOf: input.asOf.toISOString(), ...(failure ? { stoppedEarly: true } : {}) },
        }),
      );
    } catch (err) {
      if (!failure) throw err;
    }
  }
  if (failure) throw failure;

  const warnings: { sku: string; reason: string }[] = [];
  if (input.decision === "approve" && decided.length) {
    const now = new Date();
    for (const listId of new Set(decided.map((d) => d.priceListId))) {
      const onList = decided.filter((d) => d.priceListId === listId);
      const active = await getActivePrices([...new Set(onList.map((d) => d.variantId))], listId, now);
      for (const d of onList) {
        if (d.effectiveFrom > now) warnings.push({ sku: d.sku, reason: `takes effect on ${d.effectiveFrom.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}` });
        else if (active.get(d.variantId)?.id !== d.id) warnings.push({ sku: d.sku, reason: "a later price is already in force" });
      }
    }
  }
  return { decision: input.decision, decided: decided.length, skipped, warnings, batchId };
}

export async function priceHistory(actor: Actor, variantId: string) {
  requirePermission(actor, ["catalog.view", "prices.edit", "reports.view"]);
  const db = getDb();
  const creator = alias(users, "creator");
  const decider = alias(users, "decider");
  const rows = await db
    .select({ v: variantPrices, list: priceLists.name, createdByName: creator.displayName, decidedByName: decider.displayName })
    .from(variantPrices)
    .innerJoin(priceLists, eq(priceLists.id, variantPrices.priceListId))
    .innerJoin(creator, eq(creator.id, variantPrices.createdBy))
    .leftJoin(decider, eq(decider.id, variantPrices.decidedBy))
    .where(eq(variantPrices.variantId, variantId))
    .orderBy(desc(variantPrices.createdAt));
  const showCost = can(actor, "costs.view");
  return rows.map((r) => ({
    ...r.v,
    landedCostSnapshot: showCost ? r.v.landedCostSnapshot : null,
    marginPercentSnapshot: showCost ? r.v.marginPercentSnapshot : null,
    previousMarginPercent: showCost ? r.v.previousMarginPercent : null,
    listName: r.list,
    createdByName: r.createdByName,
    decidedByName: r.decidedByName,
  }));
}

/* ------------------------------------------------------------------ */
/* Costs                                                               */
/* ------------------------------------------------------------------ */

export async function recordCost(
  actor: Actor,
  input: {
    variantId: string;
    purchaseCost: string;
    purchaseTaxRate: string;
    freight: string;
    handling: string;
    otherCosts: string;
    effectiveFrom?: string | null;
    supplierId?: string | null;
    sourceRef?: string | null;
    reason: string;
  },
) {
  requirePermission(actor, "costs.edit");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [variant] = await tx.select().from(productVariants).where(eq(productVariants.id, input.variantId));
    if (!variant) throw notFound("Variant");
    const now = new Date();
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : now;
    if (effectiveFrom.getTime() < now.getTime() - 60_000) throw invalid("Costs cannot be back-dated");
    const itcPolicy = await itcPolicyFromSettings(tx);
    const landed = landedUnitCost({ ...input, itcPolicy });
    const previous = (await getActiveCosts([variant.id], now, tx)).get(variant.id) ?? null;
    const [row] = await tx
      .insert(variantCosts)
      .values({
        variantId: variant.id,
        purchaseCost: D(input.purchaseCost).toFixed(4),
        purchaseTaxRate: input.purchaseTaxRate,
        freight: D(input.freight).toFixed(4),
        handling: D(input.handling).toFixed(4),
        otherCosts: D(input.otherCosts).toFixed(4),
        itcPolicy,
        landedCost: landed.toFixed(4),
        effectiveFrom,
        supplierId: input.supplierId ?? null,
        sourceRef: input.sourceRef ?? null,
        reason: input.reason,
        createdBy: actor.id,
      })
      .returning();

    // Margin impact against the current retail price
    const list = await getDefaultPriceList(tx);
    const price = (await getActivePrices([variant.id], list.id, now, tx)).get(variant.id);
    const ctx = (await getVariantPricingContext([variant.id], tx)).get(variant.id)!;
    const taxSettings = await getSettings("tax", tx);
    const taxMode = taxSettings.registrationType === "composition" || taxSettings.registrationType === "unregistered" ? "none" : "charged";
    const before = price && previous ? marginFor(price.price, price.priceIncludesTax, ctx.gstRate, ctx.cessRate, previous.landedCost, taxMode) : null;
    const after = price ? marginFor(price.price, price.priceIncludesTax, ctx.gstRate, ctx.cessRate, row.landedCost, taxMode) : null;

    await audit(tx, auditActorOf(actor), {
      action: "cost.change",
      entityType: "variant",
      entityId: variant.id,
      summary: `Recorded cost for ${variant.sku}: landed ₹${previous?.landedCost ?? "—"} → ₹${row.landedCost}`,
      data: {
        costVersionId: row.id,
        previousLandedCost: previous?.landedCost ?? null,
        landedCost: row.landedCost,
        itcPolicy,
        marginBefore: before?.toFixed(2) ?? null,
        marginAfter: after?.toFixed(2) ?? null,
        reason: input.reason,
        sourceRef: input.sourceRef ?? null,
      },
    });
    return { ...row, marginAfter: after?.toFixed(2) ?? null };
  });
}

export async function costHistory(actor: Actor, variantId: string) {
  requirePermission(actor, "costs.view");
  const db = getDb();
  return db
    .select({ c: variantCosts, createdByName: users.displayName })
    .from(variantCosts)
    .innerJoin(users, eq(users.id, variantCosts.createdBy))
    .where(eq(variantCosts.variantId, variantId))
    .orderBy(desc(variantCosts.createdAt))
    .then((rows) => rows.map((r) => ({ ...r.c, createdByName: r.createdByName })));
}

/** Price suggestion for the editor: tax-exclusive and inclusive price for the target margin. */
export function suggestPrice(landedCost: string, targetMarginPercent: string, gstRate: string) {
  const mPct = D(targetMarginPercent).div(100);
  if (mPct.greaterThanOrEqualTo(1) || mPct.isNegative()) return null;
  const excl = D(landedCost).div(new Dec(1).minus(mPct));
  return { exclusive: m(excl), inclusive: m(excl.times(D(100).plus(D(gstRate))).div(100)) };
}

export function assertCanSeeCosts(actor: Actor) {
  if (!can(actor, "costs.view")) throw forbidden("You do not have permission to view costs");
}
