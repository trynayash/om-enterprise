import "server-only";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, type Tx } from "@/server/db/client";
import {
  approvalRequests,
  customers,
  documents,
  payments,
  priceLists,
  products,
  productVariants,
  saleLines,
  sales,
  units,
  users,
  variantUnitConversions,
  brands,
} from "@/server/db/schema";
import { audit } from "@/server/audit";
import { auditActorOf, can, requirePermission, requireSuperAdmin, type Actor } from "@/server/auth/actor";
import { AppError, conflict, forbidden, invalid, notFound, precondition, toAppError } from "@/server/errors";
import { getSettings } from "@/server/settings";
import { verifyApproverCredentials } from "@/server/services/auth";
import {
  getActiveCosts,
  getActivePrices,
  getDefaultPriceList,
  getVariantPricingContext,
  unitPriceForQuantity,
} from "@/server/services/pricing";
import { calculateSale, type DiscountInput, type EngineLineInput, type TaxMode } from "@/lib/pricing/engine";
import { D, m, r4 } from "@/lib/money";
import { lineDescription } from "@/lib/line-description";
import { deletePhrase } from "@/lib/delete-phrase";

export type Sale = typeof sales.$inferSelect;
export type SaleLine = typeof saleLines.$inferSelect;

/* ------------------------------------------------------------------ */
/* Access helpers                                                      */
/* ------------------------------------------------------------------ */

function canSeeSale(actor: Actor, sale: Pick<Sale, "createdBy">) {
  return sale.createdBy === actor.id || can(actor, "sales.view_all");
}

async function lockSale(tx: Tx, saleId: string): Promise<Sale> {
  const [s] = await tx.select().from(sales).where(eq(sales.id, saleId)).for("update");
  if (!s || s.deletedAt) throw notFound("Sale");
  return s;
}

function assertCanEditDraft(actor: Actor, sale: Sale) {
  requirePermission(actor, "sales.create");
  if (!canSeeSale(actor, sale)) throw forbidden("This sale belongs to another staff member");
  if (sale.status !== "draft") {
    throw conflict(
      sale.status === "finalized"
        ? "This sale is finalised. Reopen it (if unpaid) to make changes."
        : `This sale is ${sale.status} and can no longer be changed`,
    );
  }
}

async function taxModeFor(placeOfSupply: string, tx?: Tx): Promise<{ taxMode: TaxMode; regType: string | null; roundOff: "none" | "nearest_rupee" }> {
  const tax = await getSettings("tax", tx);
  const business = await getSettings("business", tx);
  let taxMode: TaxMode;
  if (tax.registrationType === "regular" || tax.registrationType === null) {
    // null = not yet confirmed: preview with GST; real documents are blocked until confirmed.
    taxMode = placeOfSupply === business.stateCode ? "intra" : "inter";
  } else {
    taxMode = "none";
  }
  return { taxMode, regType: tax.registrationType, roundOff: tax.roundOff };
}

/* ------------------------------------------------------------------ */
/* Create / read                                                       */
/* ------------------------------------------------------------------ */

export async function createSale(
  actor: Actor,
  opts: { priceListId?: string; source?: "pos" | "website_order"; websiteOrderId?: string | null; tx?: Tx } = {},
) {
  requirePermission(actor, "sales.create");
  const run = async (tx: Tx) => {
    const business = await getSettings("business", tx);
    const tax = await getSettings("tax", tx);
    const list = opts.priceListId
      ? (await tx.select().from(priceLists).where(and(eq(priceLists.id, opts.priceListId), eq(priceLists.isActive, true))))[0]
      : await getDefaultPriceList(tx);
    if (!list) throw invalid("Price list is not active");
    const seq = await tx.execute<{ n: number }>(sql`select nextval('sale_number_seq')::int as n`);
    const saleNumber = `S${String(seq.rows[0].n).padStart(6, "0")}`;
    const [row] = await tx
      .insert(sales)
      .values({
        saleNumber,
        priceListId: list.id,
        placeOfSupplyStateCode: business.stateCode,
        taxMode: tax.registrationType === "composition" || tax.registrationType === "unregistered" ? "none" : "intra",
        roundOffMode: tax.roundOff,
        source: opts.source ?? "pos",
        websiteOrderId: opts.websiteOrderId ?? null,
        createdBy: actor.id,
      })
      .returning();
    await audit(tx, auditActorOf(actor), {
      action: "sale.create",
      entityType: "sale",
      entityId: row.id,
      summary: `Started sale ${saleNumber}`,
    });
    return row;
  };
  return opts.tx ? run(opts.tx) : getDb().transaction(run);
}

function stripCosts<T extends Record<string, unknown>>(row: T, keys: string[]): T {
  const copy = { ...row } as Record<string, unknown>;
  for (const k of keys) copy[k] = null;
  return copy as T;
}

const LINE_COST_KEYS = ["unitCost", "costVersionId", "costTotal", "grossProfit", "belowCost", "belowMarginFloor"];

/** Approval details carry per-line cost flags; hide them from users without cost access. */
function redactApprovalDetails(details: unknown) {
  const d = (details ?? {}) as Record<string, unknown>;
  const lines = Array.isArray(d.lines) ? (d.lines as Record<string, unknown>[]) : [];
  return {
    ...d,
    anyBelowCost: null,
    anyBelowMarginFloor: null,
    lines: lines.map((l) => ({ ...l, belowCost: null, belowMarginFloor: null })),
  };
}
const SALE_COST_KEYS = ["costTotal", "grossProfit"];

export async function getSale(actor: Actor, saleId: string) {
  const db = getDb();
  const creator = alias(users, "creator");
  const rows = await db
    .select({ s: sales, createdByName: creator.displayName, listName: priceLists.name })
    .from(sales)
    .innerJoin(creator, eq(creator.id, sales.createdBy))
    .innerJoin(priceLists, eq(priceLists.id, sales.priceListId))
    .where(eq(sales.id, saleId));
  const row = rows[0];
  if (!row || row.s.deletedAt) throw notFound("Sale");
  if (!canSeeSale(actor, row.s)) throw forbidden("You can only view your own sales");
  const showCost = can(actor, "costs.view");
  const lines = await db.select().from(saleLines).where(eq(saleLines.saleId, saleId)).orderBy(asc(saleLines.lineNo));
  const pays = await db.select().from(payments).where(eq(payments.saleId, saleId)).orderBy(asc(payments.createdAt));
  const docs = await db
    .select({
      id: documents.id,
      docType: documents.docType,
      docNumber: documents.docNumber,
      status: documents.status,
      issuedAt: documents.issuedAt,
      grandTotal: documents.grandTotal,
      validUntil: documents.validUntil,
      isTraining: documents.isTraining,
      shareToken: documents.shareToken,
    })
    .from(documents)
    .where(eq(documents.saleId, saleId))
    .orderBy(asc(documents.issuedAt));
  const approvals = await db
    .select({ a: approvalRequests, requestedByName: users.displayName })
    .from(approvalRequests)
    .innerJoin(users, eq(users.id, approvalRequests.requestedBy))
    .where(eq(approvalRequests.saleId, saleId))
    .orderBy(desc(approvalRequests.requestedAt));
  const deciderIds = approvals.map((a) => a.a.decidedBy).filter(Boolean) as string[];
  const deciders = deciderIds.length ? await db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, deciderIds)) : [];
  const customer = row.s.customerId ? (await db.select().from(customers).where(eq(customers.id, row.s.customerId)))[0] ?? null : null;
  return {
    sale: showCost ? row.s : stripCosts(row.s, SALE_COST_KEYS),
    createdByName: row.createdByName,
    priceListName: row.listName,
    lines: showCost ? lines : lines.map((l) => stripCosts(l, LINE_COST_KEYS)),
    payments: pays,
    documents: docs,
    approvals: approvals.map((a) => ({
      ...a.a,
      details: showCost ? a.a.details : redactApprovalDetails(a.a.details),
      requestedByName: a.requestedByName,
      decidedByName: deciders.find((d) => d.id === a.a.decidedBy)?.name ?? null,
    })),
    customer,
    canSeeCosts: showCost,
  };
}

/* ------------------------------------------------------------------ */
/* Cart mutations                                                      */
/* ------------------------------------------------------------------ */

// A training sale is excluded from reports and uses its own numbering, so real goods must never ride along.
const MIXED_SAMPLE_MESSAGE = "SAMPLE (training) items and real items can't be in the same sale. Start a separate sale.";

export interface AddLineInput {
  variantId: string;
  quantity: string;
  unitCode?: string;
}

export async function addLine(actor: Actor, saleId: string, input: AddLineInput) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const sale = await lockSale(tx, saleId);
    assertCanEditDraft(actor, sale);
    const [row] = await tx
      .select({ v: productVariants, p: products, unit: units, brandName: brands.name })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(units, eq(units.code, productVariants.unitCode))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(eq(productVariants.id, input.variantId));
    if (!row) throw notFound("Product variant");
    if (!row.v.isActive || !row.p.isActive) throw invalid(`${row.p.name} — ${row.v.name} is not available for sale`);
    const [other] = await tx
      .select({ id: saleLines.id })
      .from(saleLines)
      .where(and(eq(saleLines.saleId, saleId), eq(saleLines.lineType, "item"), ne(saleLines.isSample, row.p.isSample)))
      .limit(1);
    if (other) throw invalid(MIXED_SAMPLE_MESSAGE);

    const unitCode = input.unitCode ?? row.v.unitCode;
    if (unitCode !== row.v.unitCode) {
      const conv = await tx
        .select()
        .from(variantUnitConversions)
        .where(and(eq(variantUnitConversions.variantId, row.v.id), eq(variantUnitConversions.unitCode, unitCode)));
      if (!conv.length) throw invalid(`${row.v.sku} cannot be sold by "${unitCode}" — no conversion is configured`);
    }
    const [unit] = await tx.select().from(units).where(eq(units.code, unitCode));
    validateQuantity(input.quantity, unit?.decimals ?? 0, unit?.name ?? unitCode);

    const price = (await getActivePrices([row.v.id], sale.priceListId, new Date(), tx)).get(row.v.id);
    if (!price) {
      throw precondition(`No selling price is configured for ${row.v.sku}. An authorised admin must set a price first.`);
    }

    // Merge with an identical plain line (same variant & unit, no override)
    const existing = (
      await tx
        .select()
        .from(saleLines)
        .where(and(eq(saleLines.saleId, saleId), eq(saleLines.variantId, row.v.id), eq(saleLines.unitCode, unitCode)))
    ).find((l) => l.priceSource !== "override" && l.priceSource !== "quotation");
    if (existing) {
      const qty = D(existing.quantity).plus(D(input.quantity));
      await tx.update(saleLines).set({ quantity: qty.toString() }).where(eq(saleLines.id, existing.id));
    } else {
      const [{ next }] = (
        await tx.execute<{ next: number }>(sql`select coalesce(max(line_no), 0) + 1 as next from sale_lines where sale_id = ${saleId}`)
      ).rows;
      await tx.insert(saleLines).values({
        saleId,
        lineNo: Number(next),
        lineType: "item",
        variantId: row.v.id,
        sku: row.v.sku,
        productName: row.p.name,
        variantName: row.v.name,
        brandName: row.brandName,
        hsnCode: row.p.hsnCode,
        unitCode,
        isSample: row.p.isSample,
        quantity: D(input.quantity).toString(),
        priceListUnitPrice: price.price,
        unitPrice: price.price,
        priceIncludesTax: price.priceIncludesTax,
        priceVersionId: price.id,
        priceSource: "price_list",
        grossAmount: "0",
        netAmount: "0",
        gstRate: "0",
        taxableValue: "0",
        lineTotal: "0",
        addedBy: actor.id,
      });
    }
    return recalculate(tx, actor, saleId);
  });
}

function validateQuantity(q: string, decimals: number, unitName: string) {
  const d = D(q);
  if (!d.isFinite() || d.lessThanOrEqualTo(0)) throw invalid("Quantity must be greater than zero");
  if (d.decimalPlaces() > decimals) {
    throw invalid(decimals === 0 ? `${unitName} must be a whole number` : `${unitName} allows at most ${decimals} decimal places`);
  }
  if (d.greaterThan(1_000_000)) throw invalid("Quantity is too large");
}

export interface UpdateLineInput {
  quantity?: string;
  discount?: DiscountInput;
  discountReason?: string | null;
  overridePrice?: string | null;
  overrideReason?: string | null;
}

export async function updateLine(actor: Actor, saleId: string, lineId: string, input: UpdateLineInput) {
  const db = getDb();
  const discounts = await getSettings("discounts");
  return db.transaction(async (tx) => {
    const sale = await lockSale(tx, saleId);
    assertCanEditDraft(actor, sale);
    const [line] = await tx.select().from(saleLines).where(and(eq(saleLines.id, lineId), eq(saleLines.saleId, saleId)));
    if (!line) throw notFound("Line");
    const set: Partial<typeof saleLines.$inferInsert> = {};

    if (input.quantity !== undefined) {
      const [unit] = await tx.select().from(units).where(eq(units.code, line.unitCode));
      validateQuantity(input.quantity, line.lineType === "charge" ? 2 : (unit?.decimals ?? 0), unit?.name ?? line.unitCode);
      set.quantity = D(input.quantity).toString();
      // A quoted price holds only for the quoted quantity (it may be a bulk-tier price):
      // a different quantity is priced at today's price for that quantity.
      if (line.priceSource === "quotation" && !D(input.quantity).equals(D(line.quantity))) set.priceSource = "price_list";
    }

    if (input.discount !== undefined) {
      const has = input.discount && !D(input.discount.value).isZero();
      if (has) {
        requirePermission(actor, "discounts.apply");
        if (line.lineType === "charge") throw invalid("Charges cannot be discounted");
        if (discounts.requireReasonForAnyDiscount && !input.discountReason?.trim()) throw invalid("Please give a reason for the discount");
        set.lineDiscountType = input.discount!.type;
        set.lineDiscountValue = m(input.discount!.value);
        set.lineDiscountReason = input.discountReason?.trim() || null;
      } else {
        set.lineDiscountType = null;
        set.lineDiscountValue = null;
        set.lineDiscountReason = null;
      }
    }

    if (input.overridePrice !== undefined) {
      if (line.lineType === "charge") {
        if (input.overridePrice === null) throw invalid("A charge needs an amount");
        set.unitPrice = m(input.overridePrice);
        set.priceListUnitPrice = m(input.overridePrice);
      } else if (input.overridePrice === null) {
        set.priceSource = "price_list";
        set.overrideReason = null;
      } else {
        requirePermission(actor, "pricing.override_price");
        if (!input.overrideReason?.trim()) throw invalid("Please give a reason for changing the price");
        set.priceSource = "override";
        set.unitPrice = m(input.overridePrice);
        set.overrideReason = input.overrideReason.trim();
      }
    }

    await tx.update(saleLines).set(set).where(eq(saleLines.id, lineId));
    if (input.discount !== undefined || (input.overridePrice !== undefined && line.lineType === "item")) {
      await audit(tx, auditActorOf(actor), {
        action: input.overridePrice !== undefined ? "discount.price_override" : "discount.line_applied",
        entityType: "sale",
        entityId: saleId,
        summary:
          input.overridePrice !== undefined
            ? input.overridePrice === null
              ? `Removed price override on ${line.sku} (${sale.saleNumber})`
              : `Changed price of ${line.sku} on ${sale.saleNumber}: ₹${line.priceListUnitPrice} → ₹${m(input.overridePrice)} (${input.overrideReason?.trim()})`
            : set.lineDiscountType
              ? `Applied ${set.lineDiscountType === "percent" ? `${set.lineDiscountValue}%` : `₹${set.lineDiscountValue}`} discount on ${line.sku} (${sale.saleNumber})`
              : `Removed discount on ${line.sku} (${sale.saleNumber})`,
        data: {
          lineId,
          sku: line.sku,
          listUnitPrice: line.priceListUnitPrice,
          discount: set.lineDiscountType ? { type: set.lineDiscountType, value: set.lineDiscountValue, reason: set.lineDiscountReason } : null,
          overridePrice: input.overridePrice ?? null,
          overrideReason: input.overrideReason ?? null,
        },
      });
    }
    return recalculate(tx, actor, saleId);
  });
}

export async function removeLine(actor: Actor, saleId: string, lineId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const sale = await lockSale(tx, saleId);
    assertCanEditDraft(actor, sale);
    const res = await tx.delete(saleLines).where(and(eq(saleLines.id, lineId), eq(saleLines.saleId, saleId))).returning();
    if (!res.length) throw notFound("Line");
    // keep line numbers contiguous
    const rest = await tx.select({ id: saleLines.id }).from(saleLines).where(eq(saleLines.saleId, saleId)).orderBy(asc(saleLines.lineNo));
    for (let i = 0; i < rest.length; i++) {
      await tx.update(saleLines).set({ lineNo: 10000 + i }).where(eq(saleLines.id, rest[i].id));
    }
    for (let i = 0; i < rest.length; i++) {
      await tx.update(saleLines).set({ lineNo: i + 1 }).where(eq(saleLines.id, rest[i].id));
    }
    return recalculate(tx, actor, saleId);
  });
}

export async function addCharge(
  actor: Actor,
  saleId: string,
  input: { label: string; amount: string; gstRate: string; priceIncludesTax: boolean; sacCode?: string | null },
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const sale = await lockSale(tx, saleId);
    assertCanEditDraft(actor, sale);
    if (D(input.amount).lessThanOrEqualTo(0)) throw invalid("Charge amount must be positive");
    const [{ next }] = (
      await tx.execute<{ next: number }>(sql`select coalesce(max(line_no), 0) + 1 as next from sale_lines where sale_id = ${saleId}`)
    ).rows;
    await tx.insert(saleLines).values({
      saleId,
      lineNo: Number(next),
      lineType: "charge",
      productName: input.label.trim().slice(0, 80),
      hsnCode: input.sacCode ?? null,
      unitCode: "nos",
      quantity: "1",
      priceListUnitPrice: m(input.amount),
      unitPrice: m(input.amount),
      priceIncludesTax: input.priceIncludesTax,
      priceSource: "manual_charge",
      discountEligible: false,
      grossAmount: "0",
      netAmount: "0",
      gstRate: input.gstRate,
      taxableValue: "0",
      lineTotal: "0",
      addedBy: actor.id,
    });
    return recalculate(tx, actor, saleId);
  });
}

export async function setCartDiscount(actor: Actor, saleId: string, discount: DiscountInput, reason?: string | null) {
  const db = getDb();
  const settings = await getSettings("discounts");
  return db.transaction(async (tx) => {
    const sale = await lockSale(tx, saleId);
    assertCanEditDraft(actor, sale);
    const has = discount && !D(discount.value).isZero();
    if (has) {
      requirePermission(actor, "discounts.apply");
      if (settings.requireReasonForAnyDiscount && !reason?.trim()) throw invalid("Please give a reason for the discount");
    }
    await tx
      .update(sales)
      .set({
        cartDiscountType: has ? discount!.type : null,
        cartDiscountValue: has ? m(discount!.value) : null,
        cartDiscountReason: has ? reason?.trim() || null : null,
        updatedAt: new Date(),
      })
      .where(eq(sales.id, saleId));
    await audit(tx, auditActorOf(actor), {
      action: "discount.cart_applied",
      entityType: "sale",
      entityId: saleId,
      summary: has
        ? `Applied ${discount!.type === "percent" ? `${m(discount!.value)}%` : `₹${m(discount!.value)}`} bill discount on ${sale.saleNumber}`
        : `Removed bill discount on ${sale.saleNumber}`,
      data: { discount: has ? { type: discount!.type, value: m(discount!.value) } : null, reason: reason ?? null },
    });
    return recalculate(tx, actor, saleId);
  });
}

export async function setSaleOptions(
  actor: Actor,
  saleId: string,
  input: { placeOfSupplyStateCode?: string; priceListId?: string; notes?: string | null },
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const sale = await lockSale(tx, saleId);
    assertCanEditDraft(actor, sale);
    const set: Partial<typeof sales.$inferInsert> = { updatedAt: new Date() };
    if (input.placeOfSupplyStateCode && input.placeOfSupplyStateCode !== sale.placeOfSupplyStateCode) {
      const tax = await getSettings("tax", tx);
      const business = await getSettings("business", tx);
      if (tax.registrationType === "composition" && input.placeOfSupplyStateCode !== business.stateCode) {
        throw invalid("A composition taxable person cannot make inter-state supplies (CGST Act s.10(2)(c))");
      }
      set.placeOfSupplyStateCode = input.placeOfSupplyStateCode;
    }
    if (input.priceListId && input.priceListId !== sale.priceListId) {
      const [pl] = await tx.select().from(priceLists).where(and(eq(priceLists.id, input.priceListId), eq(priceLists.isActive, true)));
      if (!pl) throw invalid("Price list is not active");
      set.priceListId = pl.id;
    }
    if (input.notes !== undefined) set.notes = input.notes?.slice(0, 500) ?? null;
    await tx.update(sales).set(set).where(eq(sales.id, saleId));
    return recalculate(tx, actor, saleId);
  });
}

/* ------------------------------------------------------------------ */
/* Recalculation — the single place draft sale amounts are computed   */
/* ------------------------------------------------------------------ */

export interface CartEvaluation {
  approvalNeeded: boolean;
  approvalReasons: string[];
  /** Fingerprint the approval must match. */
  fingerprint: string;
  missingPrices: string[];
}

function fingerprintOf(sale: Sale, lines: SaleLine[], taxMode: TaxMode): string {
  const canonical = JSON.stringify({
    pl: sale.priceListId,
    tm: taxMode,
    pos: sale.placeOfSupplyStateCode,
    cd: sale.cartDiscountType ? [sale.cartDiscountType, D(sale.cartDiscountValue).toFixed(2)] : null,
    l: lines
      .slice()
      .sort((a, b) => a.lineNo - b.lineNo)
      .map((l) => [
        l.lineType,
        l.variantId,
        l.unitCode,
        D(l.quantity).toString(),
        D(l.priceListUnitPrice).toFixed(2),
        D(l.unitPrice).toFixed(2),
        l.lineDiscountType,
        l.lineDiscountValue ? D(l.lineDiscountValue).toFixed(2) : null,
      ]),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Approval policy, evaluated against a specific operator's limits. */
export function approvalReasonsFor(
  operator: Actor,
  totals: { maxLineDiscountPercent: string; effectiveDiscountPercent: string; anyBelowCost: boolean; anyBelowMarginFloor: boolean },
): string[] {
  const reasons: string[] = [];
  const limit = D(operator.discountLimitPercent);
  if (D(totals.maxLineDiscountPercent).greaterThan(limit) || D(totals.effectiveDiscountPercent).greaterThan(limit)) {
    const pct = D(totals.maxLineDiscountPercent).greaterThan(D(totals.effectiveDiscountPercent)) ? totals.maxLineDiscountPercent : totals.effectiveDiscountPercent;
    reasons.push(`Discount ${pct}% exceeds ${operator.displayName}'s limit of ${limit.toFixed(2)}%`);
  }
  if (!can(operator, "pricing.sell_below_cost") && (totals.anyBelowCost || totals.anyBelowMarginFloor)) {
    // Without cost access, don't say which threshold was crossed (it would reveal the cost).
    if (!can(operator, "costs.view")) reasons.push("One or more prices are below the allowed minimum");
    else if (totals.anyBelowCost) reasons.push("One or more items would be sold below cost");
    else reasons.push("One or more items would be sold below the minimum margin");
  }
  return reasons;
}

/** Can `approver` authorise this request? */
export function approverCanApprove(
  approver: Actor,
  details: { maxDiscountPercent: string; anyBelowCost: boolean; anyBelowMarginFloor: boolean },
): string | null {
  if (approver.isSuperAdmin) return null;
  if (!can(approver, "discounts.approve")) return "You do not have permission to approve discounts";
  if (D(details.maxDiscountPercent).greaterThan(D(approver.approvalLimitPercent))) {
    return `This discount (${details.maxDiscountPercent}%) is above your approval limit of ${approver.approvalLimitPercent}%`;
  }
  if ((details.anyBelowCost || details.anyBelowMarginFloor) && !can(approver, "pricing.sell_below_cost")) {
    return "Only a user allowed to sell below cost / margin can approve this";
  }
  return null;
}

export async function recalculate(tx: Tx, operator: Actor, saleId: string) {
  const sale = await lockSale(tx, saleId);
  if (sale.status !== "draft") throw conflict("Only draft sales can be recalculated");
  const lines = await tx.select().from(saleLines).where(eq(saleLines.saleId, saleId)).orderBy(asc(saleLines.lineNo));
  const { taxMode, roundOff } = await taxModeFor(sale.placeOfSupplyStateCode, tx);
  const now = new Date();

  const variantIds = [...new Set(lines.filter((l) => l.variantId).map((l) => l.variantId!))];
  // Sequential: a transaction uses a single connection.
  const prices = await getActivePrices(variantIds, sale.priceListId, now, tx);
  const costs = await getActiveCosts(variantIds, now, tx);
  const ctx = await getVariantPricingContext(variantIds, tx);
  const conversions = variantIds.length
    ? await tx.select().from(variantUnitConversions).where(inArray(variantUnitConversions.variantId, variantIds))
    : [];
  const quoteValid = !!sale.quotationValidUntil && sale.quotationValidUntil > now;

  const missingPrices: string[] = [];
  const priced = lines.map((l) => {
    if (l.lineType === "charge") return { line: l, list: l.unitPrice, unit: l.unitPrice, incl: l.priceIncludesTax, source: l.priceSource, versionId: null as string | null, factor: D(1) };
    const factor = D(conversions.find((c) => c.variantId === l.variantId && c.unitCode === l.unitCode)?.factor ?? 1);
    if (l.priceSource === "quotation" && quoteValid) {
      return { line: l, list: l.priceListUnitPrice, unit: l.unitPrice, incl: l.priceIncludesTax, source: "quotation" as const, versionId: l.priceVersionId, factor };
    }
    const pv = prices.get(l.variantId!);
    if (!pv) {
      missingPrices.push(l.sku ?? l.productName);
      return { line: l, list: l.priceListUnitPrice, unit: l.unitPrice, incl: l.priceIncludesTax, source: l.priceSource, versionId: l.priceVersionId, factor };
    }
    const baseQty = D(l.quantity).times(factor).toString();
    const { price, tier } = unitPriceForQuantity(pv, baseQty);
    const listPerUnit = m(D(price).times(factor));
    if (l.priceSource === "override") {
      return { line: l, list: listPerUnit, unit: l.unitPrice, incl: pv.priceIncludesTax, source: "override" as const, versionId: pv.id, factor };
    }
    return {
      line: l,
      list: listPerUnit,
      unit: listPerUnit,
      incl: pv.priceIncludesTax,
      source: (tier ? "quantity_tier" : "price_list") as SaleLine["priceSource"],
      versionId: pv.id,
      factor,
    };
  });

  const engineLines: EngineLineInput[] = priced.map(({ line, list, unit, incl, factor }) => {
    const c = line.variantId ? ctx.get(line.variantId) : undefined;
    const cost = line.variantId ? costs.get(line.variantId) : undefined;
    return {
      key: line.id,
      kind: line.lineType,
      quantity: line.quantity,
      listUnitPrice: list,
      unitPrice: unit,
      priceIncludesTax: incl,
      gstRate: line.lineType === "charge" ? line.gstRate : (c?.gstRate ?? "0"),
      cessRate: c?.cessRate ?? "0",
      hsnCode: line.hsnCode,
      discountEligible: line.lineType === "item" && (c?.discountEligible ?? true),
      lineDiscount: line.lineDiscountType ? { type: line.lineDiscountType, value: line.lineDiscountValue ?? "0" } : null,
      unitCost: cost ? r4(D(cost.landedCost).times(factor)).toString() : null,
      minMarginPercent: c?.minMarginPercent ?? null,
    };
  });

  const result = calculateSale({
    lines: engineLines,
    cartDiscount: sale.cartDiscountType ? { type: sale.cartDiscountType, value: sale.cartDiscountValue ?? "0" } : null,
    taxMode,
    roundOff,
  });

  // Persist line results
  for (let i = 0; i < priced.length; i++) {
    const { line, list, unit, incl, source, versionId } = priced[i];
    const r = result.lines[i];
    const cost = line.variantId ? costs.get(line.variantId) : undefined;
    await tx
      .update(saleLines)
      .set({
        priceListUnitPrice: m(list),
        unitPrice: m(unit),
        priceIncludesTax: incl,
        priceSource: source,
        priceVersionId: versionId,
        discountEligible: r.discountEligible,
        grossAmount: m(r.grossAmount),
        lineDiscountAmount: m(r.lineDiscountAmount),
        cartDiscountShare: m(r.cartDiscountShare),
        netAmount: m(r.netAmount),
        gstRate: r.gstRate.toFixed(3),
        cessRate: r.cessRate.toFixed(3),
        taxableValue: m(r.taxableValue),
        cgstAmount: m(r.cgstAmount),
        sgstAmount: m(r.sgstAmount),
        igstAmount: m(r.igstAmount),
        cessAmount: m(r.cessAmount),
        lineTotal: m(r.lineTotal),
        unitCost: r.unitCost ? r.unitCost.toFixed(4) : null,
        costVersionId: cost?.id ?? null,
        costTotal: r.costTotal ? m(r.costTotal) : null,
        grossProfit: r.grossProfit ? m(r.grossProfit) : null,
        belowCost: r.belowCost,
        belowMarginFloor: r.belowMarginFloor,
      })
      .where(eq(saleLines.id, line.id));
  }

  const t = result.totals;
  const freshLines = await tx.select().from(saleLines).where(eq(saleLines.saleId, saleId));
  const fingerprint = fingerprintOf(sale, freshLines, taxMode);
  const reasons = approvalReasonsFor(operator, {
    maxLineDiscountPercent: t.maxLineDiscountPercent.toFixed(2),
    effectiveDiscountPercent: t.effectiveDiscountPercent.toFixed(2),
    anyBelowCost: t.anyBelowCost,
    anyBelowMarginFloor: t.anyBelowMarginFloor,
  });

  // Approval state bound to the exact cart
  const reqs = await tx
    .select()
    .from(approvalRequests)
    .where(and(eq(approvalRequests.saleId, saleId), inArray(approvalRequests.status, ["pending", "approved"])));
  let approvalStatus: Sale["approvalStatus"] = "not_required";
  let approvalRequestId: string | null = null;
  for (const r of reqs) {
    if (r.cartFingerprint !== fingerprint && r.status === "pending") {
      await tx
        .update(approvalRequests)
        .set({ status: "superseded", decidedAt: now, decisionNote: "Cart changed after the request" })
        .where(eq(approvalRequests.id, r.id));
    }
  }
  if (reasons.length) {
    const approved = reqs.find((r) => r.status === "approved" && r.cartFingerprint === fingerprint);
    const pending = reqs.find((r) => r.status === "pending" && r.cartFingerprint === fingerprint);
    approvalStatus = approved ? "approved" : pending ? "pending" : "required";
    approvalRequestId = approved?.id ?? null;
  }
  const rejected = reasons.length && !approvalRequestId
    ? (await tx.select().from(approvalRequests).where(and(eq(approvalRequests.saleId, saleId), eq(approvalRequests.status, "rejected"), eq(approvalRequests.cartFingerprint, fingerprint))))[0]
    : undefined;
  if (rejected && approvalStatus === "required") approvalStatus = "rejected";

  const isTraining = freshLines.some((l) => l.isSample);
  await tx
    .update(sales)
    .set({
      taxMode,
      roundOffMode: roundOff,
      isTraining,
      listTotal: m(t.listTotal),
      subtotalGross: m(t.subtotalGross),
      lineDiscountTotal: m(t.lineDiscountTotal),
      cartDiscountTotal: m(t.cartDiscountTotal),
      taxableTotal: m(t.taxableTotal),
      cgstTotal: m(t.cgstTotal),
      sgstTotal: m(t.sgstTotal),
      igstTotal: m(t.igstTotal),
      cessTotal: m(t.cessTotal),
      chargesTotal: m(t.chargesTotal),
      roundOff: m(t.roundOff),
      grandTotal: m(t.grandTotal),
      effectiveDiscountPercent: t.effectiveDiscountPercent.toFixed(2),
      costKnown: t.costKnown,
      costTotal: t.costTotal ? m(t.costTotal) : null,
      grossProfit: t.grossProfit ? m(t.grossProfit) : null,
      cartFingerprint: fingerprint,
      approvalStatus,
      approvalRequestId,
      updatedAt: now,
    })
    .where(eq(sales.id, saleId));

  const seesCost = can(operator, "costs.view");
  return {
    approvalNeeded: reasons.length > 0 && approvalStatus !== "approved",
    approvalReasons: reasons,
    fingerprint,
    missingPrices,
    taxSummary: result.taxSummary.map((r) => ({
      hsnCode: r.hsnCode,
      gstRate: r.gstRate.toFixed(2),
      taxableValue: m(r.taxableValue),
      cgst: m(r.cgstAmount),
      sgst: m(r.sgstAmount),
      igst: m(r.igstAmount),
      cess: m(r.cessAmount),
    })),
    totals: {
      maxLineDiscountPercent: t.maxLineDiscountPercent.toFixed(2),
      effectiveDiscountPercent: t.effectiveDiscountPercent.toFixed(2),
      // Cost signals only for users with cost access (they would otherwise reveal the cost).
      anyBelowCost: seesCost ? t.anyBelowCost : null,
      anyBelowMarginFloor: seesCost ? t.anyBelowMarginFloor : null,
      anyCostUnknown: seesCost ? t.anyCostUnknown : null,
      totalReduction: m(t.totalReduction),
    },
  };
}

/** Recalculate on demand (e.g. when the POS opens a draft) and return the evaluation. */
export async function refreshDraft(actor: Actor, saleId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const sale = await lockSale(tx, saleId);
    if (!canSeeSale(actor, sale)) throw forbidden();
    if (sale.status !== "draft") return null;
    requirePermission(actor, "sales.create");
    return recalculate(tx, actor, saleId);
  });
}

/* ------------------------------------------------------------------ */
/* Approvals                                                           */
/* ------------------------------------------------------------------ */

async function approvalDetails(tx: Tx, saleId: string) {
  const [s] = await tx.select().from(sales).where(eq(sales.id, saleId));
  const ls = await tx.select().from(saleLines).where(eq(saleLines.saleId, saleId)).orderBy(asc(saleLines.lineNo));
  const items = ls.filter((l) => l.lineType === "item");
  const lineDiscounts = items.map((l) => {
    const listGross = D(l.priceListUnitPrice).times(D(l.quantity));
    const red = listGross.minus(D(l.netAmount));
    return listGross.greaterThan(0) && red.greaterThan(0) ? red.div(listGross).times(100).toDecimalPlaces(2) : D(0);
  });
  const maxLine = lineDiscounts.reduce((a, b) => (b.greaterThan(a) ? b : a), D(0));
  const maxDiscount = D(s.effectiveDiscountPercent).greaterThan(maxLine) ? D(s.effectiveDiscountPercent) : maxLine;
  return {
    saleNumber: s.saleNumber,
    grandTotal: s.grandTotal,
    listTotal: s.listTotal,
    effectiveDiscountPercent: s.effectiveDiscountPercent,
    maxDiscountPercent: maxDiscount.toFixed(2),
    anyBelowCost: items.some((l) => l.belowCost),
    anyBelowMarginFloor: items.some((l) => l.belowMarginFloor),
    lines: items.map((l, i) => ({
      sku: l.sku,
      name: lineDescription(null, l.productName, l.variantName),
      quantity: l.quantity,
      unit: l.unitCode,
      listUnitPrice: l.priceListUnitPrice,
      unitPrice: l.unitPrice,
      netAmount: l.netAmount,
      discountPercent: lineDiscounts[i].toFixed(2),
      priceSource: l.priceSource,
      overrideReason: l.overrideReason,
      discountReason: l.lineDiscountReason,
      belowCost: l.belowCost,
      belowMarginFloor: l.belowMarginFloor,
    })),
    cartDiscount: s.cartDiscountType ? { type: s.cartDiscountType, value: s.cartDiscountValue, reason: s.cartDiscountReason } : null,
  };
}

export async function requestApproval(actor: Actor, saleId: string, reason: string) {
  requirePermission(actor, "sales.create");
  if (!reason.trim()) throw invalid("Please explain why this discount is needed");
  const db = getDb();
  return db.transaction(async (tx) => {
    const sale = await lockSale(tx, saleId);
    assertCanEditDraft(actor, sale);
    const evalRes = await recalculate(tx, actor, saleId);
    if (!evalRes.approvalNeeded) throw conflict("This cart does not need approval");
    const details = await approvalDetails(tx, saleId);
    const [req] = await tx
      .insert(approvalRequests)
      .values({
        type: "sale_discount",
        saleId,
        cartFingerprint: evalRes.fingerprint,
        details: { ...details, reasons: evalRes.approvalReasons, requesterLimitPercent: actor.discountLimitPercent },
        reason: reason.trim(),
        requestedBy: actor.id,
      })
      .returning();
    await tx.update(sales).set({ approvalStatus: "pending" }).where(eq(sales.id, saleId));
    await audit(tx, auditActorOf(actor), {
      action: "discount.approval_requested",
      entityType: "sale",
      entityId: saleId,
      summary: `Requested approval for ${details.maxDiscountPercent}% discount on ${details.saleNumber} (₹${details.grandTotal})`,
      data: { approvalRequestId: req.id, reasons: evalRes.approvalReasons, reason },
    });
    return req;
  });
}

const CART_CHANGED = "The cart changed after approval was requested. A new request is needed.";

/**
 * Decides a pending request. When the cart changed since it was asked, the request is marked
 * superseded and "superseded" is returned instead of throwing, so that mark is kept: the caller
 * reports the conflict after the transaction commits.
 */
async function applyDecision(
  tx: Tx,
  approver: Actor,
  req: typeof approvalRequests.$inferSelect,
  decision: "approve" | "reject",
  note: string | null,
  channel: "remote" | "in_person",
  onBehalfOf?: Actor,
): Promise<"approved" | "rejected" | "cancelled" | "superseded"> {
  const sale = await lockSale(tx, req.saleId!);
  if (sale.status !== "draft") {
    if (decision === "approve") throw conflict("The sale is no longer a draft");
    // Rejecting a request whose sale was finalised or cancelled clears it from the queue.
    const details = req.details as { maxDiscountPercent?: string; saleNumber?: string };
    const why = note ? `Sale no longer open — ${note}` : "Sale no longer open";
    await tx
      .update(approvalRequests)
      .set({ status: "cancelled", decidedBy: approver.id, decidedAt: new Date(), decisionNote: why, decisionChannel: channel })
      .where(eq(approvalRequests.id, req.id));
    await audit(tx, auditActorOf(approver), {
      action: "discount.approval_cancelled",
      entityType: "sale",
      entityId: sale.id,
      summary: `Cleared the ${details.maxDiscountPercent ?? "?"}% discount request on ${sale.saleNumber}: the sale is ${sale.status}`,
      data: { approvalRequestId: req.id, note: why, channel, saleStatus: sale.status },
    });
    return "cancelled";
  }
  if (sale.cartFingerprint !== req.cartFingerprint) {
    await tx.update(approvalRequests).set({ status: "superseded", decidedAt: new Date(), decisionNote: "Cart changed" }).where(eq(approvalRequests.id, req.id));
    return "superseded";
  }
  if (approver.id === req.requestedBy && !approver.isSuperAdmin) throw forbidden("You cannot approve your own request");
  const details = req.details as { maxDiscountPercent: string; anyBelowCost: boolean; anyBelowMarginFloor: boolean; saleNumber: string; grandTotal: string };
  if (decision === "approve") {
    const why = approverCanApprove(approver, details);
    if (why) throw forbidden(why);
  } else if (!approver.isSuperAdmin && !can(approver, "discounts.approve")) {
    throw forbidden("You do not have permission to decide approvals");
  }
  const status = decision === "approve" ? "approved" : "rejected";
  await tx
    .update(approvalRequests)
    .set({ status, decidedBy: approver.id, decidedAt: new Date(), decisionNote: note, decisionChannel: channel })
    .where(eq(approvalRequests.id, req.id));
  await tx
    .update(sales)
    .set({ approvalStatus: status, approvalRequestId: decision === "approve" ? req.id : null })
    .where(eq(sales.id, sale.id));
  await audit(tx, auditActorOf(approver), {
    action: decision === "approve" ? "discount.approved" : "discount.rejected",
    entityType: "sale",
    entityId: sale.id,
    summary: `${decision === "approve" ? "Approved" : "Rejected"} ${details.maxDiscountPercent}% discount on ${details.saleNumber}${
      channel === "in_person" ? ` (in person at the counter for ${onBehalfOf?.displayName ?? "cashier"})` : ""
    }`,
    data: { approvalRequestId: req.id, note, channel, details },
  });
  return status;
}

export async function decideApproval(approver: Actor, requestId: string, decision: "approve" | "reject", note?: string | null) {
  requirePermission(approver, "discounts.approve");
  const db = getDb();
  const status = await db.transaction(async (tx) => {
    const [req] = await tx.select().from(approvalRequests).where(eq(approvalRequests.id, requestId)).for("update");
    if (!req || req.type !== "sale_discount") throw notFound("Approval request");
    if (req.status !== "pending") throw conflict(`This request is already ${req.status}`);
    return applyDecision(tx, approver, req, decision, note ?? null, "remote");
  });
  if (status === "superseded") throw conflict(CART_CHANGED);
  return { status };
}

/**
 * Approve or reject several discount requests, each in its own transaction. A request that can't be
 * decided (above the approver's limit, below cost, their own, the cart changed…) is skipped with
 * the reason; the rest go ahead.
 */
export async function decideApprovals(approver: Actor, input: { decision: "approve" | "reject"; note?: string | null; ids: string[] }) {
  requirePermission(approver, "discounts.approve");
  const ids = [...new Set(input.ids)];
  if (!ids.length) throw invalid("Choose at least one request");
  if (ids.length > 100) throw invalid("Decide at most 100 requests at a time");
  const note = input.note?.trim() || null;
  if (input.decision === "reject" && (!note || note.length < 3)) throw invalid("Give a reason for rejecting (at least 3 characters)");
  if (note && note.length > 300) throw invalid("Keep the note to 300 characters or fewer");
  const db = getDb();
  const known = await db
    .select({ id: approvalRequests.id, saleNumber: sales.saleNumber })
    .from(approvalRequests)
    .innerJoin(sales, eq(sales.id, approvalRequests.saleId))
    .where(and(inArray(approvalRequests.id, ids), eq(approvalRequests.type, "sale_discount")));
  const saleNumberOf = new Map(known.map((k) => [k.id, k.saleNumber]));
  const decided: { id: string; saleNumber: string; status: "approved" | "rejected" | "cancelled" }[] = [];
  const skipped: { id: string; saleNumber: string | null; reason: string }[] = [];
  let failure: unknown = null;
  for (const id of ids) {
    try {
      const r = await decideApproval(approver, id, input.decision, note);
      decided.push({ id, saleNumber: saleNumberOf.get(id) ?? "", status: r.status as "approved" | "rejected" | "cancelled" });
    } catch (err) {
      const e = toAppError(err);
      // An unexpected failure stops the run; the summary below still records what was done.
      if (e.code === "INTERNAL") {
        failure = err;
        break;
      }
      skipped.push({ id, saleNumber: saleNumberOf.get(id) ?? null, reason: e.message });
    }
  }
  const count = (s: string) => decided.filter((d) => d.status === s).length;
  try {
    await db.transaction((tx) =>
      audit(tx, auditActorOf(approver), {
        action: "discount.bulk_decided",
        entityType: "approval_request",
        summary: `${input.decision === "approve" ? "Approved" : "Rejected"} ${count(input.decision === "approve" ? "approved" : "rejected")} of ${ids.length} discount requests at once${count("cancelled") ? ` (${count("cancelled")} cleared, sale no longer open)` : ""}${skipped.length ? ` · ${skipped.length} skipped` : ""}`,
        data: { decision: input.decision, note, ids, decided, skipped, ...(failure ? { stoppedEarly: true } : {}) },
      }),
    );
  } catch (err) {
    if (!failure) throw err;
  }
  if (failure) throw failure;
  return { decision: input.decision, decided: decided.length, cancelled: count("cancelled"), skipped };
}

/**
 * A manager approves at the counter by entering their own credentials on the cashier's screen.
 * The approver's identity (not the cashier's) is recorded on the approval.
 */
export async function approveInPerson(
  cashier: Actor,
  saleId: string,
  approverUsername: string,
  approverPassword: string,
  note: string | null,
  client: { ip: string; userAgent: string },
  approverSecretKey?: string | null,
) {
  const settings = await getSettings("discounts");
  if (!settings.inPersonApprovalEnabled) throw forbidden("In-person approval is disabled");
  // Only the cashier who may edit this draft can ask for a password at the counter.
  const [pre] = await getDb().select().from(sales).where(eq(sales.id, saleId));
  if (!pre) throw notFound("Sale");
  assertCanEditDraft(cashier, pre);
  const approver = await verifyApproverCredentials(approverUsername, approverPassword, client, cashier, approverSecretKey);
  if (approver.id === cashier.id && !approver.isSuperAdmin) throw forbidden("A different authorised person must approve");
  const db = getDb();
  return db.transaction(async (tx) => {
    const sale = await lockSale(tx, saleId);
    assertCanEditDraft(cashier, sale);
    const evalRes = await recalculate(tx, cashier, saleId);
    if (!evalRes.approvalNeeded) throw conflict("This cart does not need approval");
    const details = await approvalDetails(tx, saleId);
    const [req] = await tx
      .insert(approvalRequests)
      .values({
        type: "sale_discount",
        saleId,
        cartFingerprint: evalRes.fingerprint,
        details: { ...details, reasons: evalRes.approvalReasons, requesterLimitPercent: cashier.discountLimitPercent },
        reason: note?.trim() || "Approved in person at the counter",
        requestedBy: cashier.id,
      })
      .returning();
    // The request was made from this very cart, so it cannot be superseded here.
    if ((await applyDecision(tx, approver, req, "approve", note, "in_person", cashier)) !== "approved") throw conflict(CART_CHANGED);
    return { approvedBy: approver.displayName };
  });
}

export async function listPendingApprovals(actor: Actor) {
  requirePermission(actor, "discounts.approve");
  const db = getDb();
  return db
    .select({ a: approvalRequests, requestedByName: users.displayName, saleNumber: sales.saleNumber, saleStatus: sales.status })
    .from(approvalRequests)
    .innerJoin(users, eq(users.id, approvalRequests.requestedBy))
    .innerJoin(sales, eq(sales.id, approvalRequests.saleId))
    .where(eq(approvalRequests.status, "pending"))
    .orderBy(desc(approvalRequests.requestedAt));
}

/* ------------------------------------------------------------------ */
/* Finalise / reopen / cancel                                          */
/* ------------------------------------------------------------------ */

export async function finalizeSale(actor: Actor, saleId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const sale = await lockSale(tx, saleId);
    assertCanEditDraft(actor, sale);
    const evalRes = await recalculate(tx, actor, saleId);
    if (evalRes.missingPrices.length) {
      throw precondition(`No current price for: ${evalRes.missingPrices.join(", ")}`);
    }
    const lines = await tx.select().from(saleLines).where(eq(saleLines.saleId, saleId));
    if (!lines.some((l) => l.lineType === "item")) throw invalid("Add at least one item before finalising");
    const items = lines.filter((l) => l.lineType === "item");
    if (items.some((l) => l.isSample) && items.some((l) => !l.isSample)) throw invalid(MIXED_SAMPLE_MESSAGE);
    if (evalRes.approvalNeeded) {
      throw new AppError("APPROVAL_REQUIRED", `Approval needed: ${evalRes.approvalReasons.join("; ")}`, { reasons: evalRes.approvalReasons });
    }
    const fresh = await lockSale(tx, saleId);
    const tax = await getSettings("tax", tx);
    if (!fresh.isTraining && tax.registrationType === null) {
      throw precondition(
        "GST registration type has not been confirmed in Settings → Tax. Only training (sample) sales can be completed until the Super Admin configures it.",
      );
    }
    if (D(fresh.grandTotal).lessThanOrEqualTo(0)) throw invalid("The total must be greater than zero");
    const now = new Date();
    const [row] = await tx
      .update(sales)
      .set({ status: "finalized", finalizedAt: now, finalizedBy: actor.id, updatedAt: now })
      .where(eq(sales.id, saleId))
      .returning();
    await audit(tx, auditActorOf(actor), {
      action: "sale.finalize",
      entityType: "sale",
      entityId: saleId,
      summary: `Finalised ${row.saleNumber}: ₹${row.grandTotal}${D(row.effectiveDiscountPercent).isZero() ? "" : ` (discount ${row.effectiveDiscountPercent}%)`}${row.isTraining ? " [TRAINING]" : ""}`,
      data: {
        grandTotal: row.grandTotal,
        taxableTotal: row.taxableTotal,
        discount: { line: row.lineDiscountTotal, cart: row.cartDiscountTotal, effectivePercent: row.effectiveDiscountPercent },
        approvalRequestId: row.approvalRequestId,
        fingerprint: row.cartFingerprint,
      },
    });
    return row;
  });
}

export async function reopenSale(actor: Actor, saleId: string, reason: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const sale = await lockSale(tx, saleId);
    requirePermission(actor, "sales.create");
    if (!canSeeSale(actor, sale)) throw forbidden();
    if (sale.status !== "finalized") throw conflict("Only a finalised, unpaid sale can be reopened");
    const ps = await tx.select().from(payments).where(eq(payments.saleId, saleId));
    if (ps.some((p) => p.status === "successful")) throw conflict("Payments have been received — this sale cannot be reopened");
    const docs = await tx.select().from(documents).where(and(eq(documents.saleId, saleId), sql`${documents.docType} <> 'quotation'`));
    if (docs.length) throw conflict("A bill has been issued — use cancellation or a credit note instead");
    for (const p of ps.filter((p) => p.status === "initiated" || p.status === "pending")) {
      await tx.update(payments).set({ status: "cancelled", failureReason: "Sale reopened for changes", updatedAt: new Date() }).where(eq(payments.id, p.id));
    }
    await tx.update(sales).set({ status: "draft", finalizedAt: null, finalizedBy: null, updatedAt: new Date() }).where(eq(sales.id, saleId));
    await audit(tx, auditActorOf(actor), {
      action: "sale.reopen",
      entityType: "sale",
      entityId: saleId,
      summary: `Reopened ${sale.saleNumber} for changes`,
      data: { reason },
    });
  });
}

/**
 * Deletes a sale (Super Admin only, confirmed with their delete phrase). Sales, bills and payments are
 * never removed from the database, and bill numbers must stay used for GST, so a deleted sale is kept
 * but hidden from every list and report and can never change again: its open payment requests and
 * discount requests are closed, its bills, quotations and credit notes are cancelled with the reason,
 * and one audit record keeps what was there.
 */
export async function deleteSale(actor: Actor, saleId: string, input: { confirm: string; reason?: string | null }) {
  requireSuperAdmin(actor);
  if (input.confirm.trim() !== deletePhrase(actor.username)) throw invalid(`Paste ${deletePhrase(actor.username)} exactly to confirm`);
  const reason = input.reason?.trim().slice(0, 300) || "Deleted by the Super Admin";
  const db = getDb();
  return db.transaction(async (tx) => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, saleId)).for("update");
    if (!sale) throw notFound("Sale");
    if (sale.deletedAt) throw conflict(`${sale.saleNumber} is already deleted`);
    const now = new Date();
    await tx
      .update(payments)
      .set({ status: "cancelled", failureReason: "Sale deleted", updatedAt: now })
      .where(and(eq(payments.saleId, saleId), inArray(payments.status, ["pending", "initiated"])));
    await tx
      .update(approvalRequests)
      .set({ status: "cancelled", decidedBy: actor.id, decidedAt: now, decisionNote: "Sale deleted" })
      .where(and(eq(approvalRequests.saleId, saleId), eq(approvalRequests.status, "pending")));
    const docs = await tx.select().from(documents).where(eq(documents.saleId, saleId)).orderBy(asc(documents.issuedAt)).for("update");
    for (const d of docs.filter((d) => !d.deletedAt)) {
      await tx
        .update(documents)
        .set({
          ...(d.status === "issued" ? { status: "cancelled", cancelledAt: now, cancelledBy: actor.id, cancelReason: `Sale ${sale.saleNumber} deleted: ${reason}` } : {}),
          deletedAt: now,
          deletedBy: actor.id,
          deleteReason: reason,
        })
        .where(eq(documents.id, d.id));
    }
    await tx.update(sales).set({ deletedAt: now, deletedBy: actor.id, deleteReason: reason }).where(eq(sales.id, saleId));
    const received = D(sale.amountPaid).minus(D(sale.amountRefunded));
    const cancelled = docs.filter((d) => d.status === "issued" && !d.deletedAt).map((d) => d.docNumber);
    await audit(tx, auditActorOf(actor), {
      action: "sale.deleted",
      entityType: "sale",
      entityId: sale.id,
      summary: `Deleted ${sale.saleNumber} (₹${sale.grandTotal}${received.greaterThan(0) ? `, ₹${m(received)} received` : ""})${cancelled.length ? `; cancelled ${cancelled.join(", ")}` : ""}: ${reason}`,
      data: {
        saleNumber: sale.saleNumber,
        status: sale.status,
        grandTotal: sale.grandTotal,
        received: m(received),
        isTraining: sale.isTraining,
        documents: docs.map((d) => ({ id: d.id, docNumber: d.docNumber, docType: d.docType, status: d.status })),
        reason,
      },
    });
    return { saleNumber: sale.saleNumber, cancelledDocuments: cancelled };
  });
}

export async function cancelSale(actor: Actor, saleId: string, reason: string) {
  if (!reason.trim()) throw invalid("Please give a reason");
  const db = getDb();
  return db.transaction(async (tx) => {
    const sale = await lockSale(tx, saleId);
    requirePermission(actor, "sales.create");
    if (sale.createdBy !== actor.id) requirePermission(actor, "sales.cancel");
    if (sale.status === "cancelled") throw conflict("Already cancelled");
    if (sale.status === "completed") throw conflict("Completed sales are reversed via invoice cancellation / credit note");
    const ps = await tx.select().from(payments).where(eq(payments.saleId, saleId));
    if (ps.some((p) => p.status === "successful" && p.direction === "in")) {
      throw conflict("Payments have been received — record a refund before cancelling");
    }
    for (const p of ps.filter((p) => p.status === "initiated" || p.status === "pending")) {
      await tx.update(payments).set({ status: "cancelled", failureReason: "Sale cancelled", updatedAt: new Date() }).where(eq(payments.id, p.id));
    }
    const now = new Date();
    await tx
      .update(sales)
      .set({ status: "cancelled", cancelledAt: now, cancelledBy: actor.id, cancelReason: reason.trim(), updatedAt: now })
      .where(eq(sales.id, saleId));
    await tx
      .update(approvalRequests)
      .set({ status: "cancelled", decidedAt: now, decisionNote: "Sale cancelled" })
      .where(and(eq(approvalRequests.saleId, saleId), eq(approvalRequests.status, "pending")));
    await audit(tx, auditActorOf(actor), {
      action: "sale.cancel",
      entityType: "sale",
      entityId: saleId,
      summary: `Cancelled ${sale.saleNumber} (${sale.status})`,
      data: { reason },
    });
  });
}

export async function attachCustomer(actor: Actor, saleId: string, customerId: string | null) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const sale = await lockSale(tx, saleId);
    requirePermission(actor, "sales.create");
    if (!canSeeSale(actor, sale)) throw forbidden();
    if (sale.status === "completed" || sale.status === "cancelled") throw conflict("Customer can't be changed after billing");
    if (customerId) {
      const [c] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId));
      if (!c) throw notFound("Customer");
    }
    await tx.update(sales).set({ customerId, updatedAt: new Date() }).where(eq(sales.id, saleId));
  });
}

/* ------------------------------------------------------------------ */
/* Search / history                                                    */
/* ------------------------------------------------------------------ */

export interface SaleFilter {
  q?: string;
  status?: string;
  paymentStatus?: string;
  from?: Date;
  to?: Date;
  staffId?: string;
  includeTraining?: boolean;
  /** Only sales with at least one item line (leaves out empty drafts). */
  hasItems?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listSales(actor: Actor, f: SaleFilter) {
  requirePermission(actor, ["sales.create", "sales.view_all", "payments.view"]);
  const db = getDb();
  const where: SQL[] = [];
  if (!can(actor, "sales.view_all")) where.push(eq(sales.createdBy, actor.id));
  else if (f.staffId) where.push(eq(sales.createdBy, f.staffId));
  if (f.status) where.push(eq(sales.status, f.status as Sale["status"]));
  if (f.paymentStatus) where.push(eq(sales.paymentStatus, f.paymentStatus as Sale["paymentStatus"]));
  if (f.from) where.push(gte(sales.createdAt, f.from));
  if (f.to) where.push(lte(sales.createdAt, f.to));
  if (!f.includeTraining) where.push(eq(sales.isTraining, false));
  where.push(isNull(sales.deletedAt));
  if (f.hasItems) where.push(sql`exists (select 1 from sale_lines l where l.sale_id = ${sales.id} and l.line_type = 'item')`);
  const q = f.q?.trim();
  if (q) {
    const like = `%${q}%`;
    where.push(
      or(
        ilike(sales.saleNumber, like),
        sql`exists (select 1 from documents d where d.sale_id = ${sales.id} and d.doc_number ilike ${like})`,
        sql`exists (select 1 from customers c where c.id = ${sales.customerId} and (c.name ilike ${like} or c.mobile like ${like} or c.business_name ilike ${like}))`,
        sql`exists (select 1 from sale_lines l where l.sale_id = ${sales.id} and (l.sku ilike ${like} or l.product_name ilike ${like}))`,
        sql`exists (select 1 from payments p where p.sale_id = ${sales.id} and p.reference ilike ${like})`,
      )!,
    );
  }
  const pageSize = Math.min(f.pageSize ?? 30, 200);
  const page = Math.max(1, f.page ?? 1);
  const creator = alias(users, "creator");
  const rows = await db
    .select({
      id: sales.id,
      saleNumber: sales.saleNumber,
      status: sales.status,
      paymentStatus: sales.paymentStatus,
      approvalStatus: sales.approvalStatus,
      isTraining: sales.isTraining,
      grandTotal: sales.grandTotal,
      amountPaid: sales.amountPaid,
      amountRefunded: sales.amountRefunded,
      lineDiscountTotal: sales.lineDiscountTotal,
      cartDiscountTotal: sales.cartDiscountTotal,
      taxTotal: sql<string>`(${sales.cgstTotal} + ${sales.sgstTotal} + ${sales.igstTotal} + ${sales.cessTotal})::text`,
      createdAt: sales.createdAt,
      completedAt: sales.completedAt,
      createdByName: creator.displayName,
      customerName: customers.name,
      customerMobile: customers.mobile,
      docNumber: sql<string | null>`(select d.doc_number from documents d where d.sale_id = "sales"."id" and d.doc_type <> 'quotation' and d.doc_type <> 'credit_note' order by d.issued_at desc limit 1)`,
      docStatus: sql<string | null>`(select d.status from documents d where d.sale_id = "sales"."id" and d.doc_type <> 'quotation' and d.doc_type <> 'credit_note' order by d.issued_at desc limit 1)`,
      paymentMethods: sql<string | null>`(select string_agg(distinct p.method, ', ') from payments p where p.sale_id = "sales"."id" and p.status = 'successful')`,
      itemCount: sql<number>`(select count(*)::int from sale_lines l where l.sale_id = "sales"."id" and l.line_type = 'item')`,
      total: sql<number>`count(*) over ()::int`,
    })
    .from(sales)
    .innerJoin(creator, eq(creator.id, sales.createdBy))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(sales.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { items: rows.map(({ total: _t, ...r }) => r), total: rows[0]?.total ?? 0, page, pageSize };
}
