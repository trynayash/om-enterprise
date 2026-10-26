import { describe, expect, it } from "vitest";
import { layoutDocument, type Draw } from "@/server/pdf/bill-sheet";
import { renderDocumentPdf } from "@/server/pdf/document-pdf";
import { readImportFile } from "@/lib/import-files";
import { youSavedOf } from "@/lib/bill-layout";
import type { DocLine, DocSnapshot } from "@/lib/document-types";

// The shop's own Bill of Supply 729 (18 Oct 2026), the layout this one copies.
const line = (sl: number, description: string, unitPrice: string, discount: string, total: string, mrp: string, colour: string | null, material: string | null): DocLine => ({
  sl,
  kind: "item",
  description,
  sku: null,
  hsn: "39251000",
  quantity: "1",
  unit: "Piece",
  unitCode: "pcs",
  unitPrice,
  priceIncludesTax: true,
  discount,
  taxableValue: total,
  gstRate: "0",
  cgstRate: "0",
  cgstAmount: "0",
  sgstRate: "0",
  sgstAmount: "0",
  igstRate: "0",
  igstAmount: "0",
  cessAmount: "0",
  total,
  isSample: false,
  mrp,
  colour,
  material,
});
const tank = line(1, "1000LTR UMIYA GOLD PURE 5LYR WATER TANK", "9700.00", "700.00", "9000.00", "10000.00", null, "Pure");
const base = line(2, "1000LTR TANK BASE", "2500.00", "300.00", "2200.00", "2800.00", "BLACK", null);

const bill = (lines: DocLine[]): DocSnapshot => ({
  version: 1,
  docType: "bill_of_supply",
  title: "BILL OF SUPPLY",
  subtitle: null,
  declarationTop: "Composition taxable person, not eligible to collect tax on supplies",
  isTraining: false,
  watermark: null,
  number: "729",
  issuedAt: "2026-10-18T10:00:00.000Z",
  financialYear: "2026-27",
  saleNumber: "S-0729",
  validUntil: null,
  original: null,
  reason: null,
  seller: {
    name: "OM ENTERPRISE",
    tagline: "",
    addressLines: ["NR. SHIVANI SHOWROOM, BODELI ROAD NASWADI"],
    stateCode: "24",
    stateName: "Gujarat",
    phone: "7621934414",
    email: "omenterprise1119@gmail.com",
    gstin: "24CSLPM5670H1ZF",
    pan: null,
    registrationType: "composition",
  },
  buyer: {
    name: "GUMANBHAI BHURABHAI VASAVA",
    businessName: null,
    address: "KADIKUVA VASAVA",
    city: null,
    stateCode: "24",
    stateName: "Gujarat",
    pincode: null,
    mobile: null,
    email: null,
    gstin: null,
  },
  placeOfSupply: { stateCode: "24", stateName: "Gujarat" },
  supplyType: "intra",
  reverseCharge: false,
  showTax: false,
  lines,
  taxSummary: [],
  totals: {
    gross: "12200.00",
    lineDiscount: "1000.00",
    cartDiscount: "0",
    taxable: "11200.00",
    cgst: "0",
    sgst: "0",
    igst: "0",
    cess: "0",
    taxTotal: "0",
    charges: "0",
    roundOff: "0",
    grandTotal: "11200.00",
    amountInWords: "Eleven Thousand Two Hundred Rupees only",
    youSaved: youSavedOf(lines),
  },
  payments: [{ method: "cash", amount: "11200.00", reference: null, at: "2026-10-18T10:00:00.000Z", verification: null, direction: "in" }],
  paymentStatus: "Paid",
  amountPaid: "11200.00",
  balanceDue: "0.00",
  terms: [],
  signatoryLabel: "",
  footerNote: "Thanks for doing business with us!",
  bankDetails: "",
  notes: null,
  issuedBy: "Kishan",
});

const texts = (draws: Draw[]) => draws.filter((d): d is Extract<Draw, { k: "text" }> => d.k === "text");
const find = (draws: Draw[], text: string) => texts(draws).find((d) => d.text === text);
/** The ruled frame: every line except the ones under item rows, which depend on the items. */
const frame = (draws: Draw[]) =>
  draws
    .filter((d): d is Extract<Draw, { k: "line" }> => d.k === "line")
    .filter((d) => !(d.y1 === d.y2 && d.y1 > 180 && d.y1 < 372.75))
    .map((d) => [d.x1, d.y1, d.x2, d.y2, d.width].map((v) => v.toFixed(2)).join(","));
const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...(i % 2 ? base : tank), sl: i + 1 }));

describe("the bill sheet", () => {
  it("puts everything where the shop's own Bill of Supply 729 has it (to within half a point)", () => {
    const [page] = layoutDocument(bill([tank, base]), { status: "issued" });
    // [text, left edge, top] measured from the shop's PDF
    const expected: [string, number, number][] = [
      ["Bill of Supply", 272.0, 41.3],
      ["OM ENTERPRISE", 65.6, 56.8],
      ["Invoice No.", 300.6, 54.5],
      ["729", 300.6, 62.6],
      ["18-10-2026", 433.0, 62.6],
      ["Place of Supply", 300.6, 74.8],
      ["24-Gujarat", 300.6, 82.8],
      ["Phone no.: 7621934414", 65.6, 78.2],
      ["GSTIN: 24CSLPM5670H1ZF", 65.6, 96.2],
      ["Bill To", 37.9, 119.8],
      ["GUMANBHAI BHURABHAI VASAVA", 37.9, 132.3],
      ["Item name", 53.1, 169.8],
      ["10000.00", 290.8, 185.8],
      ["(7.216%)", 484.7, 189.5],
      ["(12.0%)", 488.4, 209.0],
      ["₹ 9,000.00", 529.5, 185.8],
      ["Total", 53.1, 375.3],
      ["₹ 11,200.00", 524.1, 375.3],
      ["Invoice Amount In Words", 35.85, 387.5],
      ["Eleven Thousand Two Hundred Rupees only", 35.85, 399.3],
      ["Cash", 35.85, 424.1],
      ["You Saved", 300.6, 448.3],
      ["₹ 1,600.00", 529.5, 448.3],
      ["Terms and conditions", 40.0, 466.1],
      ["Authorized Signatory", 398.6, 513.3],
    ];
    for (const [text, x, y] of expected) {
      const d = find(page, text);
      expect(d, text).toBeDefined();
      expect(Math.abs(d!.x - x), `${text} x`).toBeLessThan(0.6);
      expect(Math.abs(d!.y - y), `${text} y`).toBeLessThan(0.6);
    }
    // The long name wraps where the shop's bill wraps it.
    expect(find(page, "1000LTR UMIYA GOLD PURE 5LYR")).toBeDefined();
    expect(find(page, "WATER TANK")).toBeDefined();
  });

  it("has the same frame for one item and for ten, and fits ten two-line items on one page", () => {
    const one = layoutDocument(bill([tank]), { status: "issued" });
    const ten = layoutDocument(bill(many(10)), { status: "issued" });
    expect(one).toHaveLength(1);
    expect(ten).toHaveLength(1);
    expect(frame(ten[0])).toEqual(frame(one[0]));
  });

  it("continues on another page with the same frame when the items do not fit, totals on the last", () => {
    const pages = layoutDocument(bill(many(25)), { status: "issued" });
    expect(pages).toHaveLength(3);
    for (const p of pages) expect(frame(p)).toEqual(frame(pages[0]));
    expect(find(pages[0], "Continued on the next page")).toBeDefined();
    expect(find(pages[0], "Page 1 of 3")).toBeDefined();
    expect(find(pages[0], "Total")).toBeUndefined();
    expect(find(pages[2], "Total")).toBeDefined();
    expect(find(pages[2], "Cash")).toBeDefined();
  });

  it("makes an A4 PDF in Roboto with the shop's logo, readable back as text", async () => {
    const pdf = await renderDocumentPdf(bill([tank, base]), { status: "issued", copyLabel: "Original for Recipient" });
    const raw = Buffer.from(pdf).toString("latin1");
    expect(raw).toMatch(/\/MediaBox \[0 0 595\.28 841\.89\]/);
    expect(raw).toMatch(/Roboto-Regular/);
    expect(raw).toMatch(/Roboto-Bold/);
    expect(raw).toMatch(/\/Subtype \/Image/);
    const text = (await readImportFile("bill.pdf", new Uint8Array(pdf))).tables[0].rows.flat().join(" ");
    for (const want of ["Bill of Supply", "Original for Recipient", "HSN/ SAC", "Price/ Unit", "₹ 9,700.00", "(7.216%)", "PCS", "You Saved", "Authorized Signatory"])
      expect(text, want).toContain(want);
  });
});
