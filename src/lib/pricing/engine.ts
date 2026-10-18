/**
 * OM Enterprise pricing engine — the ONE place where sale amounts are calculated.
 *
 * Used by the POS, quotations, website order requests, invoices and reports.
 * Pure and deterministic: no DB access, no clock, no floats.
 *
 * Calculation order (GST-compliant: discounts recorded on the invoice reduce the
 * taxable value — CGST Act s.15(3)(a), Rule 46(k)):
 *
 *   1. Line gross        = round2(quantity × unit price)
 *   2. Line discount     = percent of gross, or fixed amount (≤ gross)
 *   3. Cart discount     = allocated across discount-eligible item lines in
 *                          proportion to their post-line-discount amounts
 *                          (largest-remainder method, so shares sum exactly)
 *   4. Net amount        = gross − line discount − cart share   (in the price's tax basis)
 *   5. Tax               = tax-inclusive: extracted from net; tax-exclusive: added on net
 *                          intra-state → CGST = SGST = rate/2 each; inter-state → IGST
 *   6. Line total        = taxable value + taxes
 *   7. Grand total       = Σ line totals (+ charges) → optional round-off to nearest rupee
 *
 * All amounts are rounded to paise with ROUND_HALF_UP at each stored step.
 */
import { D, Dec, HUNDRED, r0, r2, ZERO, type DecInput } from "@/lib/money";

export type DiscountType = "percent" | "amount";
export type DiscountInput = { type: DiscountType; value: DecInput } | null | undefined;
export type TaxMode = "intra" | "inter" | "none";
export type RoundOffMode = "none" | "nearest_rupee";

export interface EngineLineInput {
  key: string;
  kind: "item" | "charge";
  quantity: DecInput;
  /** Authorised price (price list / quantity tier / valid quotation) per unit. */
  listUnitPrice: DecInput;
  /** Price actually charged per unit (= listUnitPrice unless an authorised override). */
  unitPrice: DecInput;
  priceIncludesTax: boolean;
  /** Total GST rate in percent (e.g. 18). Ignored when taxMode = "none". */
  gstRate: DecInput;
  cessRate?: DecInput;
  hsnCode?: string | null;
  discountEligible: boolean;
  lineDiscount?: DiscountInput;
  /** Landed cost per unit on a tax-exclusive basis consistent with the ITC policy. */
  unitCost?: DecInput | null;
  /** Minimum gross margin % allowed for this line (null = no floor). */
  minMarginPercent?: DecInput | null;
}

export interface EngineInput {
  lines: EngineLineInput[];
  cartDiscount?: DiscountInput;
  taxMode: TaxMode;
  roundOff: RoundOffMode;
}

export interface EngineLineResult {
  key: string;
  kind: "item" | "charge";
  quantity: Dec;
  listUnitPrice: Dec;
  unitPrice: Dec;
  priceIncludesTax: boolean;
  discountEligible: boolean;
  listGross: Dec;
  grossAmount: Dec;
  lineDiscountAmount: Dec;
  cartDiscountShare: Dec;
  netAmount: Dec;
  /** (listGross − net) / listGross × 100, including override reductions. */
  discountPercent: Dec;
  gstRate: Dec;
  cessRate: Dec;
  cgstRate: Dec;
  sgstRate: Dec;
  igstRate: Dec;
  taxableValue: Dec;
  cgstAmount: Dec;
  sgstAmount: Dec;
  igstAmount: Dec;
  cessAmount: Dec;
  taxAmount: Dec;
  lineTotal: Dec;
  hsnCode: string | null;
  unitCost: Dec | null;
  costTotal: Dec | null;
  grossProfit: Dec | null;
  marginPercent: Dec | null;
  markupPercent: Dec | null;
  belowCost: boolean;
  belowMarginFloor: boolean;
}

export interface TaxSummaryRow {
  hsnCode: string | null;
  gstRate: Dec;
  taxableValue: Dec;
  cgstAmount: Dec;
  sgstAmount: Dec;
  igstAmount: Dec;
  cessAmount: Dec;
  totalTax: Dec;
}

export interface EngineTotals {
  /** Σ quantity × authorised price for item lines. */
  listTotal: Dec;
  /** Σ line gross for item lines (after any price override, before discounts). */
  subtotalGross: Dec;
  lineDiscountTotal: Dec;
  cartDiscountTotal: Dec;
  /** Reduction caused by price overrides (list − charged), item lines. */
  overrideReductionTotal: Dec;
  /** All reductions vs. authorised prices on eligible items. */
  totalReduction: Dec;
  taxableTotal: Dec;
  cgstTotal: Dec;
  sgstTotal: Dec;
  igstTotal: Dec;
  cessTotal: Dec;
  taxTotal: Dec;
  /** Line totals of charge lines (taxes included). */
  chargesTotal: Dec;
  totalBeforeRoundOff: Dec;
  roundOff: Dec;
  grandTotal: Dec;
  /** Overall reduction % vs authorised prices across item lines. */
  effectiveDiscountPercent: Dec;
  /** Highest single-line reduction %. */
  maxLineDiscountPercent: Dec;
  /** True only if every item line has a known cost. */
  costKnown: boolean;
  costTotal: Dec | null;
  grossProfit: Dec | null;
  marginPercent: Dec | null;
  anyBelowCost: boolean;
  anyBelowMarginFloor: boolean;
  anyCostUnknown: boolean;
}

export interface EngineResult {
  lines: EngineLineResult[];
  totals: EngineTotals;
  taxSummary: TaxSummaryRow[];
}

export class PricingError extends Error {
  constructor(
    public code:
      | "INVALID_QUANTITY"
      | "INVALID_PRICE"
      | "INVALID_DISCOUNT"
      | "DISCOUNT_NOT_ELIGIBLE"
      | "DISCOUNT_EXCEEDS_AMOUNT"
      | "INVALID_TAX_RATE",
    message: string,
    public lineKey?: string,
  ) {
    super(message);
    this.name = "PricingError";
  }
}

function pctOf(amount: Dec, percent: Dec): Dec {
  return r2(amount.times(percent).div(HUNDRED));
}

function resolveDiscount(base: Dec, discount: DiscountInput, lineKey?: string): Dec {
  if (!discount) return ZERO;
  const value = D(discount.value);
  if (value.isNegative()) {
    throw new PricingError("INVALID_DISCOUNT", "Discount cannot be negative", lineKey);
  }
  if (value.isZero()) return ZERO;
  if (discount.type === "percent") {
    if (value.greaterThan(100)) {
      throw new PricingError("INVALID_DISCOUNT", "Discount percent cannot exceed 100", lineKey);
    }
    return pctOf(base, value);
  }
  const amt = r2(value);
  if (amt.greaterThan(base)) {
    throw new PricingError(
      "DISCOUNT_EXCEEDS_AMOUNT",
      `Discount ₹${amt.toFixed(2)} exceeds the amount ₹${base.toFixed(2)}`,
      lineKey,
    );
  }
  return amt;
}

/**
 * Split `total` across `weights` proportionally, in paise, so the parts sum exactly to `total`.
 * Largest-remainder method; ties go to the earlier index (deterministic).
 */
export function allocateProportionally(total: Dec, weights: Dec[]): Dec[] {
  const weightSum = weights.reduce((a, w) => a.plus(w), new Dec(0));
  if (total.isZero() || weightSum.isZero()) return weights.map(() => new Dec(0));
  const exact = weights.map((w) => total.times(w).div(weightSum));
  const floors = exact.map((e) => e.toDecimalPlaces(2, Dec.ROUND_DOWN));
  const allocated = floors.reduce((a, f) => a.plus(f), new Dec(0));
  let remainingPaise = total.minus(allocated).times(100).toDecimalPlaces(0, Dec.ROUND_HALF_UP).toNumber();
  const order = exact
    .map((e, i) => ({ i, frac: e.minus(floors[i]) }))
    .sort((a, b) => b.frac.comparedTo(a.frac) || a.i - b.i);
  const result = floors.map((f) => new Dec(f));
  for (let k = 0; remainingPaise > 0 && k < order.length; k++, remainingPaise--) {
    result[order[k].i] = result[order[k].i].plus("0.01");
  }
  return result;
}

interface TaxSplit {
  taxable: Dec;
  cgst: Dec;
  sgst: Dec;
  igst: Dec;
  cess: Dec;
}

/** Compute tax for a net amount in the given basis. Exposed for tests and credit notes. */
export function computeTax(
  net: Dec,
  gstRate: Dec,
  cessRate: Dec,
  priceIncludesTax: boolean,
  taxMode: TaxMode,
): TaxSplit {
  if (taxMode === "none" || (gstRate.isZero() && cessRate.isZero())) {
    return { taxable: net, cgst: ZERO, sgst: ZERO, igst: ZERO, cess: ZERO };
  }
  if (priceIncludesTax) {
    const divisor = HUNDRED.plus(gstRate).plus(cessRate); // e.g. 118
    const cess = r2(net.times(cessRate).div(divisor));
    if (taxMode === "intra") {
      const half = r2(net.times(gstRate.div(2)).div(divisor));
      return { taxable: net.minus(half).minus(half).minus(cess), cgst: half, sgst: half, igst: ZERO, cess };
    }
    const igst = r2(net.times(gstRate).div(divisor));
    return { taxable: net.minus(igst).minus(cess), cgst: ZERO, sgst: ZERO, igst, cess };
  }
  const cess = pctOf(net, cessRate);
  if (taxMode === "intra") {
    const half = pctOf(net, gstRate.div(2));
    return { taxable: net, cgst: half, sgst: half, igst: ZERO, cess };
  }
  return { taxable: net, cgst: ZERO, sgst: ZERO, igst: pctOf(net, gstRate), cess };
}

export function calculateSale(input: EngineInput): EngineResult {
  const { taxMode } = input;

  // Pass 1: gross & line discounts
  const stage1 = input.lines.map((l) => {
    const quantity = D(l.quantity);
    if (!quantity.isFinite() || quantity.lessThanOrEqualTo(0)) {
      throw new PricingError("INVALID_QUANTITY", "Quantity must be greater than zero", l.key);
    }
    const unitPrice = D(l.unitPrice);
    const listUnitPrice = D(l.listUnitPrice);
    if (unitPrice.isNegative() || listUnitPrice.isNegative()) {
      throw new PricingError("INVALID_PRICE", "Price cannot be negative", l.key);
    }
    const gstRate = D(l.gstRate);
    const cessRate = D(l.cessRate ?? 0);
    if (gstRate.isNegative() || gstRate.greaterThan(100) || cessRate.isNegative()) {
      throw new PricingError("INVALID_TAX_RATE", "Invalid tax rate", l.key);
    }
    const hasLineDiscount = !!l.lineDiscount && !D(l.lineDiscount.value).isZero();
    if (hasLineDiscount && (!l.discountEligible || l.kind === "charge")) {
      throw new PricingError("DISCOUNT_NOT_ELIGIBLE", "This item is not eligible for discounts", l.key);
    }
    const grossAmount = r2(quantity.times(unitPrice));
    const listGross = r2(quantity.times(listUnitPrice));
    const lineDiscountAmount = resolveDiscount(grossAmount, l.lineDiscount, l.key);
    return {
      l,
      quantity,
      unitPrice,
      listUnitPrice,
      gstRate,
      cessRate,
      grossAmount,
      listGross,
      lineDiscountAmount,
      afterLine: grossAmount.minus(lineDiscountAmount),
    };
  });

  // Pass 2: cart discount allocation over eligible item lines
  const eligibleIdx = stage1
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.l.kind === "item" && s.l.discountEligible)
    .map(({ i }) => i);
  const eligibleBase = eligibleIdx.reduce((a, i) => a.plus(stage1[i].afterLine), new Dec(0));
  const cartDiscountTotal = resolveDiscount(eligibleBase, input.cartDiscount);
  if (!cartDiscountTotal.isZero() && eligibleIdx.length === 0) {
    throw new PricingError("DISCOUNT_NOT_ELIGIBLE", "No items in the cart are eligible for discounts");
  }
  const shares = allocateProportionally(
    cartDiscountTotal,
    eligibleIdx.map((i) => stage1[i].afterLine),
  );
  const cartShare = new Map<number, Dec>();
  eligibleIdx.forEach((i, k) => cartShare.set(i, shares[k]));

  // Pass 3: tax, totals, margins
  const lines: EngineLineResult[] = stage1.map((s, i) => {
    const share = cartShare.get(i) ?? ZERO;
    const netAmount = s.afterLine.minus(share);
    const tax = computeTax(netAmount, s.gstRate, s.cessRate, s.l.priceIncludesTax, taxMode);
    const taxAmount = tax.cgst.plus(tax.sgst).plus(tax.igst).plus(tax.cess);
    const lineTotal = tax.taxable.plus(taxAmount);
    const effectiveGst = taxMode === "none" ? ZERO : s.gstRate;
    const effectiveCess = taxMode === "none" ? ZERO : s.cessRate;

    const reduction = s.listGross.minus(netAmount);
    const discountPercent =
      s.l.kind === "item" && s.listGross.greaterThan(0) && reduction.greaterThan(0)
        ? reduction.div(s.listGross).times(HUNDRED).toDecimalPlaces(2, Dec.ROUND_HALF_UP)
        : ZERO;

    let unitCost: Dec | null = null;
    let costTotal: Dec | null = null;
    let grossProfit: Dec | null = null;
    let marginPercent: Dec | null = null;
    let markupPercent: Dec | null = null;
    let belowCost = false;
    let belowMarginFloor = false;
    if (s.l.kind === "item" && s.l.unitCost !== null && s.l.unitCost !== undefined && s.l.unitCost !== "") {
      unitCost = D(s.l.unitCost);
      costTotal = r2(s.quantity.times(unitCost));
      grossProfit = tax.taxable.minus(costTotal);
      marginPercent = tax.taxable.isZero()
        ? null
        : grossProfit.div(tax.taxable).times(HUNDRED).toDecimalPlaces(2, Dec.ROUND_HALF_UP);
      markupPercent = costTotal.isZero()
        ? null
        : grossProfit.div(costTotal).times(HUNDRED).toDecimalPlaces(2, Dec.ROUND_HALF_UP);
      belowCost = tax.taxable.lessThan(costTotal);
      const floor = s.l.minMarginPercent;
      if (floor !== null && floor !== undefined && floor !== "") {
        belowMarginFloor = marginPercent === null || marginPercent.lessThan(D(floor));
      }
    }

    return {
      key: s.l.key,
      kind: s.l.kind,
      quantity: s.quantity,
      listUnitPrice: s.listUnitPrice,
      unitPrice: s.unitPrice,
      priceIncludesTax: s.l.priceIncludesTax,
      discountEligible: s.l.discountEligible,
      listGross: s.listGross,
      grossAmount: s.grossAmount,
      lineDiscountAmount: s.lineDiscountAmount,
      cartDiscountShare: share,
      netAmount,
      discountPercent,
      gstRate: effectiveGst,
      cessRate: effectiveCess,
      cgstRate: taxMode === "intra" ? effectiveGst.div(2) : ZERO,
      sgstRate: taxMode === "intra" ? effectiveGst.div(2) : ZERO,
      igstRate: taxMode === "inter" ? effectiveGst : ZERO,
      taxableValue: tax.taxable,
      cgstAmount: tax.cgst,
      sgstAmount: tax.sgst,
      igstAmount: tax.igst,
      cessAmount: tax.cess,
      taxAmount,
      lineTotal,
      hsnCode: s.l.hsnCode ?? null,
      unitCost,
      costTotal,
      grossProfit,
      marginPercent,
      markupPercent,
      belowCost,
      belowMarginFloor,
    };
  });

  const items = lines.filter((l) => l.kind === "item");
  const charges = lines.filter((l) => l.kind === "charge");
  const sumOf = (arr: EngineLineResult[], f: (l: EngineLineResult) => Dec) =>
    arr.reduce((a, l) => a.plus(f(l)), new Dec(0));

  const listTotal = sumOf(items, (l) => l.listGross);
  const subtotalGross = sumOf(items, (l) => l.grossAmount);
  const lineDiscountTotal = sumOf(items, (l) => l.lineDiscountAmount);
  const overrideReductionTotal = sumOf(items, (l) =>
    l.listGross.greaterThan(l.grossAmount) ? l.listGross.minus(l.grossAmount) : ZERO,
  );
  const eligibleItems = items.filter((l) => l.discountEligible);
  const eligibleList = sumOf(eligibleItems, (l) => l.listGross);
  const totalReduction = sumOf(eligibleItems, (l) =>
    l.listGross.greaterThan(l.netAmount) ? l.listGross.minus(l.netAmount) : ZERO,
  );
  const effectiveDiscountPercent = eligibleList.greaterThan(0)
    ? totalReduction.div(eligibleList).times(HUNDRED).toDecimalPlaces(2, Dec.ROUND_HALF_UP)
    : ZERO;
  const maxLineDiscountPercent = items.reduce(
    (max, l) => (l.discountPercent.greaterThan(max) ? l.discountPercent : max),
    new Dec(0),
  );

  const taxableTotal = sumOf(lines, (l) => l.taxableValue);
  const cgstTotal = sumOf(lines, (l) => l.cgstAmount);
  const sgstTotal = sumOf(lines, (l) => l.sgstAmount);
  const igstTotal = sumOf(lines, (l) => l.igstAmount);
  const cessTotal = sumOf(lines, (l) => l.cessAmount);
  const taxTotal = cgstTotal.plus(sgstTotal).plus(igstTotal).plus(cessTotal);
  const chargesTotal = sumOf(charges, (l) => l.lineTotal);
  const totalBeforeRoundOff = sumOf(lines, (l) => l.lineTotal);
  const grandTotal = input.roundOff === "nearest_rupee" ? r0(totalBeforeRoundOff) : totalBeforeRoundOff;
  const roundOff = grandTotal.minus(totalBeforeRoundOff);

  const anyCostUnknown = items.some((l) => l.unitCost === null);
  const costKnown = items.length > 0 && !anyCostUnknown;
  const costTotal = costKnown ? sumOf(items, (l) => l.costTotal ?? ZERO) : null;
  const itemsTaxable = sumOf(items, (l) => l.taxableValue);
  const grossProfit = costKnown && costTotal ? itemsTaxable.minus(costTotal) : null;
  const marginPercent =
    grossProfit && itemsTaxable.greaterThan(0)
      ? grossProfit.div(itemsTaxable).times(HUNDRED).toDecimalPlaces(2, Dec.ROUND_HALF_UP)
      : null;

  // HSN/rate-wise tax summary (as printed on tax invoices)
  const summaryMap = new Map<string, TaxSummaryRow>();
  for (const l of lines) {
    const k = `${l.hsnCode ?? ""}|${l.gstRate.toFixed(3)}`;
    const row =
      summaryMap.get(k) ??
      ({
        hsnCode: l.hsnCode,
        gstRate: l.gstRate,
        taxableValue: new Dec(0),
        cgstAmount: new Dec(0),
        sgstAmount: new Dec(0),
        igstAmount: new Dec(0),
        cessAmount: new Dec(0),
        totalTax: new Dec(0),
      } satisfies TaxSummaryRow);
    row.taxableValue = row.taxableValue.plus(l.taxableValue);
    row.cgstAmount = row.cgstAmount.plus(l.cgstAmount);
    row.sgstAmount = row.sgstAmount.plus(l.sgstAmount);
    row.igstAmount = row.igstAmount.plus(l.igstAmount);
    row.cessAmount = row.cessAmount.plus(l.cessAmount);
    row.totalTax = row.totalTax.plus(l.taxAmount);
    summaryMap.set(k, row);
  }

  return {
    lines,
    taxSummary: [...summaryMap.values()],
    totals: {
      listTotal,
      subtotalGross,
      lineDiscountTotal,
      cartDiscountTotal,
      overrideReductionTotal,
      totalReduction,
      taxableTotal,
      cgstTotal,
      sgstTotal,
      igstTotal,
      cessTotal,
      taxTotal,
      chargesTotal,
      totalBeforeRoundOff,
      roundOff,
      grandTotal,
      effectiveDiscountPercent,
      maxLineDiscountPercent,
      costKnown,
      costTotal,
      grossProfit,
      marginPercent,
      anyBelowCost: items.some((l) => l.belowCost),
      anyBelowMarginFloor: items.some((l) => l.belowMarginFloor),
      anyCostUnknown,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Price / cost helpers used by the price editor and reports            */
/* ------------------------------------------------------------------ */

/** Convert a configured price to its tax-exclusive value. */
export function toTaxExclusive(price: DecInput, priceIncludesTax: boolean, gstRate: DecInput, cessRate: DecInput = 0): Dec {
  const p = D(price);
  if (!priceIncludesTax) return p;
  return p.times(HUNDRED).div(HUNDRED.plus(D(gstRate)).plus(D(cessRate)));
}

/** Convert a tax-exclusive value to tax-inclusive. */
export function toTaxInclusive(exclusive: DecInput, gstRate: DecInput, cessRate: DecInput = 0): Dec {
  return D(exclusive).times(HUNDRED.plus(D(gstRate)).plus(D(cessRate))).div(HUNDRED);
}

/**
 * Landed unit cost = purchase cost (+ purchase GST only when input tax credit is NOT recoverable)
 *                  + freight + handling + other non-recoverable costs.
 * Enter freight/handling/other net of any GST that is recoverable, to avoid double counting.
 */
export function landedUnitCost(args: {
  purchaseCost: DecInput;
  purchaseTaxRate: DecInput;
  freight?: DecInput;
  handling?: DecInput;
  otherCosts?: DecInput;
  itcPolicy: "recoverable" | "non_recoverable";
}): Dec {
  const purchase = D(args.purchaseCost);
  const nonRecoverableTax =
    args.itcPolicy === "non_recoverable" ? purchase.times(D(args.purchaseTaxRate)).div(HUNDRED) : ZERO;
  return purchase
    .plus(nonRecoverableTax)
    .plus(D(args.freight ?? 0))
    .plus(D(args.handling ?? 0))
    .plus(D(args.otherCosts ?? 0))
    .toDecimalPlaces(4, Dec.ROUND_HALF_UP);
}

/**
 * Selling price (tax-exclusive) that yields `targetMarginPercent` gross margin on `landedCost`:
 *   price = cost / (1 − margin)
 * Margin is on selling price (NOT markup on cost).
 */
export function priceForTargetMargin(landedCost: DecInput, targetMarginPercent: DecInput): Dec {
  const m = D(targetMarginPercent).div(HUNDRED);
  if (m.isNegative() || m.greaterThanOrEqualTo(1)) {
    throw new PricingError("INVALID_PRICE", "Target gross margin must be between 0% and 100% (exclusive)");
  }
  return r2(D(landedCost).div(new Dec(1).minus(m)));
}

/** Gross margin % = (price − cost) / price × 100, both tax-exclusive. Null when price is 0. */
export function grossMarginPercent(sellingExclusive: DecInput, landedCost: DecInput): Dec | null {
  const p = D(sellingExclusive);
  if (p.isZero()) return null;
  return p.minus(D(landedCost)).div(p).times(HUNDRED).toDecimalPlaces(2, Dec.ROUND_HALF_UP);
}

/** Markup % = (price − cost) / cost × 100. Null when cost is 0. */
export function markupPercent(sellingExclusive: DecInput, landedCost: DecInput): Dec | null {
  const c = D(landedCost);
  if (c.isZero()) return null;
  return D(sellingExclusive).minus(c).div(c).times(HUNDRED).toDecimalPlaces(2, Dec.ROUND_HALF_UP);
}
