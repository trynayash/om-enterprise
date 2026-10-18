import { describe, expect, it } from "vitest";
import { D } from "@/lib/money";
import {
  allocateProportionally,
  calculateSale,
  grossMarginPercent,
  landedUnitCost,
  markupPercent,
  priceForTargetMargin,
  PricingError,
  toTaxExclusive,
  type EngineLineInput,
} from "@/lib/pricing/engine";

const item = (over: Partial<EngineLineInput> & { key: string }): EngineLineInput => ({
  kind: "item",
  quantity: "1",
  listUnitPrice: over.unitPrice ?? "100",
  unitPrice: "100",
  priceIncludesTax: true,
  gstRate: "18",
  discountEligible: true,
  ...over,
});

describe("pricing engine — tax", () => {
  it("extracts 18% GST from a tax-inclusive price (intra-state)", () => {
    const r = calculateSale({
      lines: [item({ key: "a", unitPrice: "1180", quantity: "2" })],
      taxMode: "intra",
      roundOff: "nearest_rupee",
    });
    const l = r.lines[0];
    expect(l.grossAmount.toFixed(2)).toBe("2360.00");
    expect(l.cgstAmount.toFixed(2)).toBe("180.00");
    expect(l.sgstAmount.toFixed(2)).toBe("180.00");
    expect(l.taxableValue.toFixed(2)).toBe("2000.00");
    expect(l.lineTotal.toFixed(2)).toBe("2360.00");
    expect(r.totals.grandTotal.toFixed(2)).toBe("2360.00");
    expect(r.totals.roundOff.toFixed(2)).toBe("0.00");
  });

  it("keeps the customer-facing inclusive total exact when tax has paise", () => {
    // 999 × 9/118 = 76.1949… → 76.19 each; taxable = 999 − 152.38
    const r = calculateSale({
      lines: [item({ key: "a", unitPrice: "999" })],
      taxMode: "intra",
      roundOff: "none",
    });
    expect(r.lines[0].cgstAmount.toFixed(2)).toBe("76.19");
    expect(r.lines[0].sgstAmount.toFixed(2)).toBe("76.19");
    expect(r.lines[0].taxableValue.toFixed(2)).toBe("846.62");
    expect(r.totals.grandTotal.toFixed(2)).toBe("999.00");
  });

  it("uses IGST for inter-state supply", () => {
    // 999 × 18/118 = 152.3898… → 152.39
    const r = calculateSale({
      lines: [item({ key: "a", unitPrice: "999" })],
      taxMode: "inter",
      roundOff: "none",
    });
    expect(r.lines[0].igstAmount.toFixed(2)).toBe("152.39");
    expect(r.lines[0].cgstAmount.toFixed(2)).toBe("0.00");
    expect(r.lines[0].taxableValue.toFixed(2)).toBe("846.61");
    expect(r.lines[0].igstRate.toFixed(0)).toBe("18");
    expect(r.totals.grandTotal.toFixed(2)).toBe("999.00");
  });

  it("adds GST on top of a tax-exclusive price", () => {
    const r = calculateSale({
      lines: [item({ key: "a", unitPrice: "1000", quantity: "3", priceIncludesTax: false })],
      taxMode: "intra",
      roundOff: "nearest_rupee",
    });
    expect(r.lines[0].taxableValue.toFixed(2)).toBe("3000.00");
    expect(r.lines[0].cgstAmount.toFixed(2)).toBe("270.00");
    expect(r.lines[0].sgstAmount.toFixed(2)).toBe("270.00");
    expect(r.totals.grandTotal.toFixed(2)).toBe("3540.00");
  });

  it("handles cess", () => {
    const r = calculateSale({
      lines: [item({ key: "a", unitPrice: "100", priceIncludesTax: false, gstRate: "28", cessRate: "12" })],
      taxMode: "intra",
      roundOff: "none",
    });
    expect(r.lines[0].cgstAmount.toFixed(2)).toBe("14.00");
    expect(r.lines[0].sgstAmount.toFixed(2)).toBe("14.00");
    expect(r.lines[0].cessAmount.toFixed(2)).toBe("12.00");
    expect(r.totals.grandTotal.toFixed(2)).toBe("140.00");
  });

  it("charges no tax when the business does not collect GST (composition / unregistered)", () => {
    const r = calculateSale({
      lines: [item({ key: "a", unitPrice: "1180" })],
      taxMode: "none",
      roundOff: "nearest_rupee",
    });
    expect(r.lines[0].taxableValue.toFixed(2)).toBe("1180.00");
    expect(r.totals.taxTotal.toFixed(2)).toBe("0.00");
    expect(r.lines[0].gstRate.toFixed(0)).toBe("0");
    expect(r.totals.grandTotal.toFixed(2)).toBe("1180.00");
  });

  it("treats a 0% (exempt) line as untaxed", () => {
    const r = calculateSale({
      lines: [item({ key: "a", unitPrice: "500", gstRate: "0" })],
      taxMode: "intra",
      roundOff: "none",
    });
    expect(r.lines[0].taxableValue.toFixed(2)).toBe("500.00");
    expect(r.totals.taxTotal.toFixed(2)).toBe("0.00");
  });
});

describe("pricing engine — exact arithmetic & rounding", () => {
  it("never shows floating-point drift", () => {
    const r = calculateSale({
      lines: [item({ key: "a", unitPrice: "0.10", quantity: "3", gstRate: "0" })],
      taxMode: "intra",
      roundOff: "none",
    });
    expect(r.totals.grandTotal.toFixed(2)).toBe("0.30");
  });

  it("supports decimal quantities (metres)", () => {
    const r = calculateSale({
      lines: [item({ key: "a", unitPrice: "45.50", quantity: "2.5", gstRate: "0" })],
      taxMode: "intra",
      roundOff: "none",
    });
    expect(r.lines[0].grossAmount.toFixed(2)).toBe("113.75");
  });

  it("rounds the grand total to the nearest rupee and records the round-off", () => {
    // 99.57 + 8.96 + 8.96 = 117.49 → 117.00 (−0.49)
    const down = calculateSale({
      lines: [item({ key: "a", unitPrice: "99.57", priceIncludesTax: false })],
      taxMode: "intra",
      roundOff: "nearest_rupee",
    });
    expect(down.totals.totalBeforeRoundOff.toFixed(2)).toBe("117.49");
    expect(down.totals.grandTotal.toFixed(2)).toBe("117.00");
    expect(down.totals.roundOff.toFixed(2)).toBe("-0.49");

    // 99.99 + 9.00 + 9.00 = 117.99 → 118.00 (+0.01)
    const up = calculateSale({
      lines: [item({ key: "a", unitPrice: "99.99", priceIncludesTax: false })],
      taxMode: "intra",
      roundOff: "nearest_rupee",
    });
    expect(up.totals.grandTotal.toFixed(2)).toBe("118.00");
    expect(up.totals.roundOff.toFixed(2)).toBe("0.01");
  });

  it("rounds exactly .50 up (half-up)", () => {
    const r = calculateSale({
      lines: [item({ key: "a", unitPrice: "117.50", gstRate: "0" })],
      taxMode: "intra",
      roundOff: "nearest_rupee",
    });
    expect(r.totals.grandTotal.toFixed(2)).toBe("118.00");
    expect(r.totals.roundOff.toFixed(2)).toBe("0.50");
  });

  it("totals always equal taxable + taxes + round-off", () => {
    const r = calculateSale({
      lines: [
        item({ key: "a", unitPrice: "333.33", quantity: "7", lineDiscount: { type: "percent", value: "3.5" } }),
        item({ key: "b", unitPrice: "1249", quantity: "1", priceIncludesTax: true }),
        item({ key: "c", unitPrice: "19.99", quantity: "13", priceIncludesTax: false, gstRate: "5" }),
      ],
      cartDiscount: { type: "amount", value: "101.01" },
      taxMode: "intra",
      roundOff: "nearest_rupee",
    });
    const t = r.totals;
    expect(t.taxableTotal.plus(t.taxTotal).plus(t.roundOff).toFixed(2)).toBe(t.grandTotal.toFixed(2));
    const lineSum = r.lines.reduce((a, l) => a.plus(l.lineTotal), D(0));
    expect(lineSum.toFixed(2)).toBe(t.totalBeforeRoundOff.toFixed(2));
    const shares = r.lines.reduce((a, l) => a.plus(l.cartDiscountShare), D(0));
    expect(shares.toFixed(2)).toBe("101.01");
  });
});

describe("pricing engine — discounts", () => {
  it("applies a percentage line discount before tax", () => {
    const r = calculateSale({
      lines: [item({ key: "a", unitPrice: "1180", lineDiscount: { type: "percent", value: "10" } })],
      taxMode: "intra",
      roundOff: "none",
    });
    const l = r.lines[0];
    expect(l.lineDiscountAmount.toFixed(2)).toBe("118.00");
    expect(l.netAmount.toFixed(2)).toBe("1062.00");
    expect(l.taxableValue.toFixed(2)).toBe("900.00");
    expect(l.cgstAmount.toFixed(2)).toBe("81.00");
    expect(l.discountPercent.toFixed(2)).toBe("10.00");
  });

  it("applies a fixed line discount on the whole line", () => {
    const r = calculateSale({
      lines: [item({ key: "a", unitPrice: "500", quantity: "4", gstRate: "0", lineDiscount: { type: "amount", value: "150" } })],
      taxMode: "intra",
      roundOff: "none",
    });
    expect(r.lines[0].netAmount.toFixed(2)).toBe("1850.00");
    expect(r.lines[0].discountPercent.toFixed(2)).toBe("7.50");
  });

  it("allocates a cart discount only across eligible items, summing exactly", () => {
    const r = calculateSale({
      lines: [
        item({ key: "a", unitPrice: "1000", gstRate: "0" }),
        item({ key: "b", unitPrice: "2000", gstRate: "0" }),
        item({ key: "c", unitPrice: "500", gstRate: "0", discountEligible: false }),
      ],
      cartDiscount: { type: "amount", value: "100" },
      taxMode: "intra",
      roundOff: "none",
    });
    expect(r.lines[0].cartDiscountShare.toFixed(2)).toBe("33.33");
    expect(r.lines[1].cartDiscountShare.toFixed(2)).toBe("66.67");
    expect(r.lines[2].cartDiscountShare.toFixed(2)).toBe("0.00");
    expect(r.totals.cartDiscountTotal.toFixed(2)).toBe("100.00");
    expect(r.totals.grandTotal.toFixed(2)).toBe("3400.00");
    // 100 off 3000 eligible = 3.33%
    expect(r.totals.effectiveDiscountPercent.toFixed(2)).toBe("3.33");
  });

  it("computes a percentage cart discount on the eligible base", () => {
    const r = calculateSale({
      lines: [
        item({ key: "a", unitPrice: "1000", gstRate: "0" }),
        item({ key: "b", unitPrice: "2000", gstRate: "0" }),
      ],
      cartDiscount: { type: "percent", value: "5" },
      taxMode: "intra",
      roundOff: "none",
    });
    expect(r.totals.cartDiscountTotal.toFixed(2)).toBe("150.00");
    expect(r.totals.grandTotal.toFixed(2)).toBe("2850.00");
  });

  it("does not double count line and cart discounts", () => {
    const r = calculateSale({
      lines: [item({ key: "a", unitPrice: "1000", gstRate: "0", lineDiscount: { type: "percent", value: "10" } })],
      cartDiscount: { type: "percent", value: "10" },
      taxMode: "intra",
      roundOff: "none",
    });
    // 1000 − 100 = 900; cart 10% of 900 = 90 → 810 (19% total, not 20%)
    expect(r.totals.lineDiscountTotal.toFixed(2)).toBe("100.00");
    expect(r.totals.cartDiscountTotal.toFixed(2)).toBe("90.00");
    expect(r.totals.grandTotal.toFixed(2)).toBe("810.00");
    expect(r.totals.effectiveDiscountPercent.toFixed(2)).toBe("19.00");
  });

  it("counts a price override as a reduction against the authorised price", () => {
    const r = calculateSale({
      lines: [item({ key: "a", listUnitPrice: "1180", unitPrice: "1100" })],
      taxMode: "intra",
      roundOff: "none",
    });
    expect(r.totals.overrideReductionTotal.toFixed(2)).toBe("80.00");
    expect(r.lines[0].discountPercent.toFixed(2)).toBe("6.78");
    expect(r.totals.maxLineDiscountPercent.toFixed(2)).toBe("6.78");
  });

  it("rejects a discount larger than the amount", () => {
    expect(() =>
      calculateSale({
        lines: [item({ key: "a", unitPrice: "100", lineDiscount: { type: "amount", value: "100.01" } })],
        taxMode: "intra",
        roundOff: "none",
      }),
    ).toThrow(PricingError);
    expect(() =>
      calculateSale({
        lines: [item({ key: "a", unitPrice: "100" })],
        cartDiscount: { type: "amount", value: "200" },
        taxMode: "intra",
        roundOff: "none",
      }),
    ).toThrow(/exceeds/);
  });

  it("rejects discounts on non-eligible items and charges", () => {
    expect(() =>
      calculateSale({
        lines: [item({ key: "a", discountEligible: false, lineDiscount: { type: "percent", value: "5" } })],
        taxMode: "intra",
        roundOff: "none",
      }),
    ).toThrow(/not eligible/);
  });

  it("rejects zero or negative quantities and percentages over 100", () => {
    expect(() =>
      calculateSale({ lines: [item({ key: "a", quantity: "0" })], taxMode: "intra", roundOff: "none" }),
    ).toThrow(/Quantity/);
    expect(() =>
      calculateSale({ lines: [item({ key: "a", quantity: "-1" })], taxMode: "intra", roundOff: "none" }),
    ).toThrow(/Quantity/);
    expect(() =>
      calculateSale({
        lines: [item({ key: "a", lineDiscount: { type: "percent", value: "101" } })],
        taxMode: "intra",
        roundOff: "none",
      }),
    ).toThrow(/100/);
  });
});

describe("pricing engine — charges", () => {
  it("adds charges with their own tax and excludes them from discounts", () => {
    const r = calculateSale({
      lines: [
        item({ key: "a", unitPrice: "1000", gstRate: "0" }),
        {
          key: "delivery",
          kind: "charge",
          quantity: "1",
          listUnitPrice: "200",
          unitPrice: "200",
          priceIncludesTax: false,
          gstRate: "18",
          discountEligible: false,
        },
      ],
      cartDiscount: { type: "percent", value: "10" },
      taxMode: "intra",
      roundOff: "none",
    });
    expect(r.totals.cartDiscountTotal.toFixed(2)).toBe("100.00");
    expect(r.lines[1].cartDiscountShare.toFixed(2)).toBe("0.00");
    expect(r.totals.chargesTotal.toFixed(2)).toBe("236.00");
    expect(r.totals.grandTotal.toFixed(2)).toBe("1136.00");
    // Charges are not "sales of goods" for list/discount metrics
    expect(r.totals.listTotal.toFixed(2)).toBe("1000.00");
  });
});

describe("pricing engine — margin & cost", () => {
  it("computes gross profit, margin and markup on tax-exclusive values", () => {
    const r = calculateSale({
      lines: [item({ key: "a", unitPrice: "1180", unitCost: "800" })],
      taxMode: "intra",
      roundOff: "none",
    });
    const l = r.lines[0];
    expect(l.taxableValue.toFixed(2)).toBe("1000.00");
    expect(l.grossProfit?.toFixed(2)).toBe("200.00");
    expect(l.marginPercent?.toFixed(2)).toBe("20.00");
    expect(l.markupPercent?.toFixed(2)).toBe("25.00");
    expect(r.totals.costKnown).toBe(true);
    expect(r.totals.grossProfit?.toFixed(2)).toBe("200.00");
  });

  it("flags sales below cost and below the margin floor", () => {
    const below = calculateSale({
      lines: [item({ key: "a", unitPrice: "1180", unitCost: "1050" })],
      taxMode: "intra",
      roundOff: "none",
    });
    expect(below.lines[0].belowCost).toBe(true);
    expect(below.totals.anyBelowCost).toBe(true);

    const thin = calculateSale({
      lines: [item({ key: "a", unitPrice: "1180", unitCost: "900", minMarginPercent: "15" })],
      taxMode: "intra",
      roundOff: "none",
    });
    expect(thin.lines[0].marginPercent?.toFixed(2)).toBe("10.00");
    expect(thin.lines[0].belowCost).toBe(false);
    expect(thin.lines[0].belowMarginFloor).toBe(true);
  });

  it("does not report profit when any item cost is unknown", () => {
    const r = calculateSale({
      lines: [item({ key: "a", unitPrice: "1180", unitCost: "800" }), item({ key: "b", unitPrice: "500" })],
      taxMode: "intra",
      roundOff: "none",
    });
    expect(r.totals.costKnown).toBe(false);
    expect(r.totals.anyCostUnknown).toBe(true);
    expect(r.totals.grossProfit).toBeNull();
    expect(r.lines[1].grossProfit).toBeNull();
  });

  it("selling price for a target margin is cost / (1 − margin), not cost × (1 + markup)", () => {
    expect(priceForTargetMargin("800", "20").toFixed(2)).toBe("1000.00");
    expect(priceForTargetMargin("75", "25").toFixed(2)).toBe("100.00");
    expect(() => priceForTargetMargin("100", "100")).toThrow();
    expect(grossMarginPercent("1000", "800")?.toFixed(2)).toBe("20.00");
    expect(markupPercent("1000", "800")?.toFixed(2)).toBe("25.00");
    expect(grossMarginPercent("0", "800")).toBeNull();
  });

  it("computes landed cost without double counting recoverable GST", () => {
    const base = { purchaseCost: "100", purchaseTaxRate: "18", freight: "5", handling: "2", otherCosts: "0" };
    expect(landedUnitCost({ ...base, itcPolicy: "recoverable" }).toFixed(4)).toBe("107.0000");
    expect(landedUnitCost({ ...base, itcPolicy: "non_recoverable" }).toFixed(4)).toBe("125.0000");
  });

  it("converts inclusive prices to exclusive", () => {
    expect(toTaxExclusive("1180", true, "18").toFixed(2)).toBe("1000.00");
    expect(toTaxExclusive("1000", false, "18").toFixed(2)).toBe("1000.00");
  });
});

describe("allocateProportionally", () => {
  it("always sums to the total and never exceeds a weight", () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let run = 0; run < 500; run++) {
      const n = 1 + Math.floor(rand() * 8);
      const weights = Array.from({ length: n }, () => D((rand() * 10000).toFixed(2)).plus("0.01"));
      const wsum = weights.reduce((a, w) => a.plus(w), D(0));
      const total = D((rand() * wsum.toNumber()).toFixed(2));
      const parts = allocateProportionally(total, weights);
      const s = parts.reduce((a, p) => a.plus(p), D(0));
      expect(s.toFixed(2)).toBe(total.toFixed(2));
      parts.forEach((p, i) => expect(p.lessThanOrEqualTo(weights[i])).toBe(true));
    }
  });
});
