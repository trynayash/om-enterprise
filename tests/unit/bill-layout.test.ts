import { describe, expect, it } from "vitest";
import { colourAndMaterial, discountPercent, optionalColumns, stateLabel, youSavedOf } from "@/lib/bill-layout";
import type { DocLine } from "@/lib/document-types";

const line = (over: Partial<DocLine>): DocLine => ({
  sl: 1,
  kind: "item",
  description: "Item",
  sku: null,
  hsn: "39251000",
  quantity: "1",
  unit: "pcs",
  unitPrice: "100.00",
  priceIncludesTax: true,
  discount: "0",
  taxableValue: "100.00",
  gstRate: "0",
  cgstRate: "0",
  cgstAmount: "0",
  sgstRate: "0",
  sgstAmount: "0",
  igstRate: "0",
  igstAmount: "0",
  cessAmount: "0",
  total: "100.00",
  isSample: false,
  ...over,
});

// The shop's own Bill of Supply 729 (18 Oct 2026): a 1000 L tank and its base.
const tank = line({ unitPrice: "9700.00", discount: "700.00", total: "9000.00", mrp: "10000.00", material: "Pure" });
const base = line({ sl: 2, unitPrice: "2500.00", discount: "300.00", total: "2200.00", mrp: "2800.00", colour: "Black" });

describe("what the bill prints beside the figures", () => {
  it("gives the discount as a share of the price before discount, as the shop's bill does", () => {
    expect(discountPercent(tank)).toBe("7.22%");
    expect(discountPercent(base)).toBe("12%");
    expect(discountPercent(line({}))).toBeNull();
    expect(discountPercent(line({ unitPrice: "50.00", quantity: "4", discount: "20.00" }))).toBe("10%");
  });

  it("works out 'You saved' from MRP, as on bill 729 (₹12,800 MRP, ₹11,200 paid)", () => {
    expect(youSavedOf([tank, base])).toBe("1600.00");
  });

  it("counts the discount where there is no MRP, or the MRP is below the price, and never charges", () => {
    expect(youSavedOf([line({ discount: "15.00", total: "85.00" })])).toBe("15.00");
    expect(youSavedOf([line({ discount: "15.00", total: "85.00", mrp: "90.00" })])).toBe("15.00");
    expect(youSavedOf([line({ kind: "charge", discount: "10.00", total: "90.00", mrp: "500.00" })])).toBe("0.00");
    expect(youSavedOf([line({})])).toBe("0.00");
  });

  it("counts a discount on a price before GST with its GST, as the customer pays it", () => {
    expect(youSavedOf([line({ priceIncludesTax: false, gstRate: "18", discount: "100.00", total: "1062.00" })])).toBe("118.00");
  });

  it("writes the state as GST forms do", () => {
    expect(stateLabel("24", "Gujarat")).toBe("24-Gujarat");
    expect(stateLabel("24", null)).toBe("24");
  });

  it("finds Colour and Material whatever the shop called them, and nothing else", () => {
    expect(colourAndMaterial({ Colour: "Black", Capacity: "1000 L" })).toEqual({ colour: "Black", material: null });
    expect(colourAndMaterial({ color: " White ", MATERIAL: "UPVC" })).toEqual({ colour: "White", material: "UPVC" });
    expect(colourAndMaterial({ Shade: "Sky Blue" })).toEqual({ colour: "Sky Blue", material: null });
    expect(colourAndMaterial({ Colour: "  " })).toEqual({ colour: null, material: null });
    expect(colourAndMaterial(null)).toEqual({ colour: null, material: null });
  });

  it("shows Colour, Material and MRP columns only when some item on the bill has them", () => {
    expect(optionalColumns([tank, base])).toEqual({ mrp: true, colour: true, material: true });
    expect(optionalColumns([line({})])).toEqual({ mrp: false, colour: false, material: false });
    // A bill issued before these were kept has none of the fields at all.
    const { mrp: _mrp, colour: _colour, material: _material, ...old } = tank;
    expect(optionalColumns([old as DocLine])).toEqual({ mrp: false, colour: false, material: false });
  });
});
