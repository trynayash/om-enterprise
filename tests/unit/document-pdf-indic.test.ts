import { describe, expect, it } from "vitest";
import { renderDocumentPdf } from "@/server/pdf/document-pdf";
import { readImportFile } from "@/lib/import-files";
import type { DocLine, DocSnapshot } from "@/lib/document-types";

/** A small bill, with Hindi and Gujarati in the customer and product names. */
const line = (sl: number, description: string, sku: string): DocLine => ({
  sl,
  kind: "item",
  description,
  sku,
  hsn: "3917",
  quantity: "2",
  unit: "pcs",
  unitPrice: "450.00",
  priceIncludesTax: true,
  discount: "0",
  taxableValue: "762.71",
  gstRate: "18",
  cgstRate: "9",
  cgstAmount: "68.64",
  sgstRate: "9",
  sgstAmount: "68.64",
  igstRate: "0",
  igstAmount: "0",
  cessAmount: "0",
  total: "900.00",
  isSample: false,
});

const snapshot = (lines: DocLine[], buyerName: string): DocSnapshot => ({
  version: 1,
  docType: "tax_invoice",
  title: "Tax Invoice",
  subtitle: null,
  declarationTop: null,
  isTraining: false,
  watermark: null,
  number: "TI/26-27/0001",
  issuedAt: "2026-10-25T10:00:00.000Z",
  financialYear: "2026-27",
  saleNumber: "S-0001",
  validUntil: null,
  original: null,
  reason: null,
  seller: {
    name: "OM ENTERPRISE",
    tagline: "Your Complete Building Solution",
    addressLines: ["Naswadi"],
    stateCode: "24",
    stateName: "Gujarat",
    phone: "9876543210",
    email: "",
    gstin: null,
    pan: null,
    registrationType: "unregistered",
  },
  buyer: { name: buyerName, businessName: null, address: null, city: null, stateCode: null, stateName: null, pincode: null, mobile: null, email: null, gstin: null },
  placeOfSupply: { stateCode: "24", stateName: "Gujarat" },
  supplyType: "intra",
  reverseCharge: false,
  showTax: true,
  lines,
  taxSummary: [],
  totals: {
    gross: "900.00",
    lineDiscount: "0",
    cartDiscount: "0",
    taxable: "762.71",
    cgst: "68.64",
    sgst: "68.64",
    igst: "0",
    cess: "0",
    taxTotal: "137.29",
    charges: "0",
    roundOff: "0",
    grandTotal: "900.00",
    amountInWords: "Nine hundred rupees only",
  },
  payments: [],
  paymentStatus: "paid",
  amountPaid: "900.00",
  balanceDue: "0",
  terms: [],
  signatoryLabel: "Authorised signatory",
  footerNote: "",
  bankDetails: "",
  notes: null,
  issuedBy: "Owner",
});

const fontsIn = (pdf: Uint8Array) =>
  [
    ...new Set(
      Buffer.from(pdf)
        .toString("latin1")
        .match(/[A-Z]{6}\+[A-Za-z-]+/g) ?? [],
    ),
  ]
    .map((f) => f.slice(7))
    .sort();

describe("bills with Hindi and Gujarati text", () => {
  it("sets text in the font of its script, so the letters are not lost", async () => {
    const pdf = await renderDocumentPdf(snapshot([line(1, "बॉल वाल्व 15 मिमी", "TL-011"), line(2, "બોલ વાલ્વ 20 mm", "TL-012"), line(3, "Ball Valve 25 mm", "TL-013")], "पटेल हार्डवेयर"), {
      status: "issued",
    });
    const fonts = fontsIn(pdf);
    // Item and customer names are bold on the bill, so their Hindi and Gujarati letters are in the bold faces.
    expect(fonts).toEqual(expect.arrayContaining(["Roboto-Regular", "Roboto-Bold", "NotoSansDevanagari-Bold", "NotoSansGujarati-Bold"]));

    // The text can be read back out of the PDF as real letters (extraction returns the vowel signs of
    // Hindi and Gujarati in the order they are drawn, so words are checked by their letters, not whole).
    const { tables } = await readImportFile("bill.pdf", new Uint8Array(pdf));
    const text = tables[0].rows.flat().join(" ");
    expect(text).toMatch(/\u092A\u091F\u0947\u0932/); // पटेल
    expect(text).toContain("वाल्व");
    expect(text).toContain("વાલ્વ");
    expect(text).toContain("Ball Valve 25 mm");
    expect(text).not.toMatch(/\uFFFD/);
  });

  it("keeps to Roboto when there is no Hindi or Gujarati", async () => {
    const pdf = await renderDocumentPdf(snapshot([line(1, "Ball Valve 15 mm", "TL-011")], "Patel Hardware"), { status: "issued" });
    expect(fontsIn(pdf).filter((f) => f.startsWith("Noto"))).toEqual([]);
  });
});
