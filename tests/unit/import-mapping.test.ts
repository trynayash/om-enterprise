import { describe, expect, it } from "vitest";
import {
  autoSku,
  buildImportRows,
  cleanSku,
  detectHeaderRow,
  guessColumns,
  importSheet,
  isTemplateHeader,
  normalizeUnit,
  parseAmount,
  parsePercent,
  suspectPrices,
  type ImportRow,
  type MappingSettings,
} from "@/lib/import-files/mapping";
import { IMPORT_COLUMNS } from "@/lib/import-columns";

const base: MappingSettings = {
  columns: {},
  category: "taps",
  brand: "Aris",
  unit: "pcs",
  gstRate: "18",
  hsnCode: "8481",
  priceIncludesTax: true,
  sellingFrom: "mrp",
  sellingLessPercent: "",
  costFrom: "none",
  costLessPercent: "",
  costIncludesTax: false,
  skuFrom: "column",
  skuPrefix: "",
  fillDown: true,
  skipWithoutPrice: true,
  sourceInfo: "Aris price list 2026",
};
const UNITS = ["pcs", "nos", "set", "m", "ltr", "box"];

describe("cell values", () => {
  it("reads Indian price formats", () => {
    expect(parseAmount("₹ 1,29,000.00/-")).toBe("129000");
    expect(parseAmount("Rs.450.50")).toBe("450.5");
    expect(parseAmount("INR 1,290")).toBe("1290");
    expect(parseAmount("850 per pc")).toBe("850");
    expect(parseAmount("On request")).toBe("");
    expect(parseAmount("-")).toBe("");
  });

  it("reads GST written as 18%, 18 or 0.18", () => {
    expect(parsePercent("18%")).toBe("18");
    expect(parsePercent("0.18")).toBe("18");
    expect(parsePercent("GST 12 %")).toBe("12");
    expect(parsePercent("5")).toBe("5");
    expect(parsePercent("Nil")).toBe("");
  });

  it("maps unit names to the shop's unit codes", () => {
    expect(normalizeUnit("Nos.", UNITS)).toBe("nos");
    expect(normalizeUnit("Mtrs", UNITS)).toBe("m");
    expect(normalizeUnit("Ltr", UNITS)).toBe("ltr");
    expect(normalizeUnit("Carton", UNITS)).toBe("box");
    expect(normalizeUnit("Gross", UNITS)).toBe("");
  });

  it("makes codes the import accepts, repeatable from the name and size", () => {
    expect(cleanSku(" AR 1102 / CP ")).toBe("AR-1102-/-CP");
    expect(cleanSku("#12")).toBe("12");
    expect(autoSku("Aris", "Pillar Cock Long Body", "15 mm")).toBe("ARIS-PILLAR-COCK-LONG-B-15-MM");
    expect(autoSku("", "Bib Cock", "Standard")).toBe("ITEM-BIB-COCK");
  });
});

describe("finding the header and the columns", () => {
  it("skips title rows to the header", () => {
    const rows = [
      ["ARIS SANITARYWARE"],
      ["Price list w.e.f. 1 April 2026"],
      [],
      ["Sl.", "Particulars", "Size", "M.R.P.", "D.P.", "HSN", "GST%", "Pkg"],
      ["1", "Bib Cock", "15 mm", "850", "560", "8481", "18", "10"],
    ];
    expect(detectHeaderRow(rows)).toBe(3);
    expect(guessColumns(rows[3], rows.slice(4))).toEqual({ product_name: 1, variant: 2, mrp: 3, purchase_cost: 4, hsn_code: 5, gst_rate: 6 });
  });

  it("knows common headings", () => {
    expect(guessColumns(["Cat. No.", "Item Description", "Colour", "List Price", "Net Rate", "Unit", "Brand"], [])).toEqual({
      sku: 0,
      product_name: 1,
      variant2: 2,
      mrp: 3,
      purchase_cost: 4,
      unit: 5,
      brand: 6,
    });
    expect(guessColumns(["Code", "Product", "Rate"], [])).toEqual({ sku: 0, product_name: 1, selling_price: 2 });
  });

  it("takes the column with the most text as the name when no heading says so", () => {
    expect(
      guessColumns(
        ["A", "B", "C"],
        [
          ["AR-1", "Wall mixer with bend", "1450"],
          ["AR-2", "Sink cock swivel", "980"],
        ],
      ).product_name,
    ).toBe(1);
  });

  it("recognises the import template itself", () => {
    expect(isTemplateHeader([...IMPORT_COLUMNS])).toBe(true);
    expect(isTemplateHeader(["Product Name", "Category", "Unit", "SKU", "Variant Name"])).toBe(true);
    expect(isTemplateHeader(["Item", "MRP"])).toBe(false);
  });
});

describe("buildImportRows", () => {
  const table = [
    ["ARIS PRICE LIST"],
    ["Code", "Item", "Size", "MRP", "Dealer"],
    ["", "Bib Cock", "", "", ""],
    ["AR-11", "", "15 mm", "₹ 850", "560"],
    ["AR-12", "", "20 mm", "₹ 990", "650"],
    ["Page 1 of 2"],
    ["ARIS PRICE LIST"],
    ["Code", "Item", "Size", "MRP", "Dealer"],
    ["AR-13", "", "25 mm", "₹ 1,250", "820"],
    ["", "Angle Cock", "", "", ""],
    ["AR-21", "", "15 mm", "On request", ""],
    ["AR-22", "", "15 mm", "640", "420"],
    ["ARIS PRICE LIST"],
    ["Prices include GST. E&OE."],
  ];
  const columns = { sku: 0, product_name: 1, variant: 2, mrp: 3, purchase_cost: 4 };

  it("names rows from headings, carries them across pages, skips page furniture and rows without price", () => {
    const out = buildImportRows(table, 1, { ...base, columns, costFrom: "column" }, UNITS);
    expect(out.rows.map((r) => [r.product_name, r.sku, r.variant_name, r.mrp, r.selling_price, r.purchase_cost])).toEqual([
      ["Bib Cock", "AR-11", "15 mm", "850", "850", "560"],
      ["Bib Cock", "AR-12", "20 mm", "990", "990", "650"],
      ["Bib Cock", "AR-13", "25 mm", "1250", "1250", "820"],
      ["Angle Cock", "AR-22", "15 mm", "640", "640", "420"],
    ]);
    expect(out.sourceRows).toEqual([4, 5, 9, 12]);
    expect(out.skipped).toEqual([
      { row: 3, reason: "Heading — name used for the rows below" },
      { row: 6, reason: "Page header or footer" },
      { row: 7, reason: "Page header or footer" },
      { row: 8, reason: "Repeated header" },
      { row: 10, reason: "Heading — name used for the rows below" },
      { row: 11, reason: "No price" },
      { row: 13, reason: "Page header or footer" },
      { row: 14, reason: "No price" },
    ]);
    expect(out.rows[0]).toMatchObject({
      category: "taps",
      brand: "Aris",
      unit: "pcs",
      gst_rate: "18",
      hsn_code: "8481",
      price_includes_tax: "yes",
      variant_attributes: "Size=15 mm",
      source_info: "Aris price list 2026 (row 4)",
    });
  });

  it("works out prices from MRP, takes GST out of a cost that includes it, and makes unique codes", () => {
    const rows = [
      ["Item", "Size", "MRP"],
      ["Bib Cock", "15 mm", "1000"],
      ["Bib Cock", "15 mm", "1000"],
      ["Bib Cock", "20 mm", "1180"],
    ];
    const out = buildImportRows(
      rows,
      0,
      {
        ...base,
        columns: { product_name: 0, variant: 1, mrp: 2 },
        sellingFrom: "mrp_less",
        sellingLessPercent: "10",
        costFrom: "mrp_less",
        costLessPercent: "41",
        costIncludesTax: true,
        skuFrom: "auto",
      },
      UNITS,
    );
    expect(out.rows.map((r) => [r.sku, r.selling_price, r.purchase_cost])).toEqual([
      ["ARIS-BIB-COCK-15-MM", "900", "500"],
      ["ARIS-BIB-COCK-15-MM-2", "900", "500"],
      ["ARIS-BIB-COCK-20-MM", "1062", "590"],
    ]);
  });

  it("uses the file's own GST, HSN and unit where it has them", () => {
    const rows = [
      ["Item", "MRP", "GST", "HSN", "UOM"],
      ["Pipe", "100", "12%", "3917 23 90", "Mtrs"],
      ["Clamp", "20", "", "", "Gross"],
    ];
    const out = buildImportRows(rows, 0, { ...base, columns: { product_name: 0, mrp: 1, gst_rate: 2, hsn_code: 3, unit: 4 }, skuFrom: "auto" }, UNITS);
    expect(out.rows.map((r) => [r.gst_rate, r.hsn_code, r.unit])).toEqual([
      ["12", "39172390", "m"],
      ["18", "8481", "pcs"],
    ]);
  });

  it("keeps rows without a price when asked (and headings are off), and turns the rows into the template sheet", () => {
    const rows = [
      ["Item", "MRP"],
      ["Bib Cock", ""],
    ];
    const out = buildImportRows(rows, 0, { ...base, columns: { product_name: 0, mrp: 1 }, skipWithoutPrice: false, fillDown: false, skuFrom: "auto" }, UNITS);
    expect(out.rows).toHaveLength(1);
    const sheet = importSheet(out.rows);
    expect(sheet[0]).toEqual([...IMPORT_COLUMNS]);
    expect(sheet[1][IMPORT_COLUMNS.indexOf("product_name")]).toBe("Bib Cock");
    expect(sheet[1][IMPORT_COLUMNS.indexOf("variant_name")]).toBe("Standard");
  });
});

describe("suspectPrices", () => {
  const row = (product_name: string, mrp: string, purchase_cost = ""): ImportRow => ({ ...(Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, ""])) as ImportRow), product_name, mrp, purchase_cost });
  const list = (mrps: string[], costs: string[] = [], name = "Elbow") => mrps.map((m, i) => row(name, m, costs[i] ?? ""));

  it("flags a lost decimal point: a price ten times its neighbours", () => {
    const flagged = suspectPrices(list(["8.5", "14.25", "205", "27.25", "33.5"]));
    expect(flagged.map((f) => f.index)).toEqual([2]);
    expect(flagged[0].reason).toMatch(/far from the sizes either side \(14.25 and 27.25\)/);
  });

  it("flags a dealer price that is off the usual share of the MRP, or above it", () => {
    const mrps = ["10", "20", "30", "40", "50", "60", "70", "80"];
    const costs = ["7", "14", "21", "280", "35", "42", "49", "90"];
    const flagged = suspectPrices(mrps.map((m, i) => row(`P${i}`, m, costs[i])));
    expect(flagged.map((f) => f.index)).toEqual([3, 7]);
    expect(flagged[1].reason).toMatch(/above the MRP/);
  });

  it("leaves a normal price list alone, including sizes that rise steeply", () => {
    expect(suspectPrices(list(["8", "12", "20", "45", "110", "260"], ["5.5", "8.5", "14", "31", "77", "182"]))).toEqual([]);
    expect(suspectPrices(list(["8.5"]))).toEqual([]);
  });

  it("does not compare sizes across different products", () => {
    const rows = [row("A", "10"), row("B", "500"), row("B", "520"), row("C", "11")];
    expect(suspectPrices(rows)).toEqual([]);
  });
});

describe("Hindi and Gujarati price lists", () => {
  const hindi = [
    ["चौधरी पाइप्स प्रा. लि."],
    ["क्र.सं.", "कोड", "विवरण", "साइज़", "एमआरपी (₹)", "डीलर रेट", "जीएसटी %", "इकाई"],
    ["१", "TL-011", "सीपीवीसी एल्बो 90°", "15 मिमी", "₹ १,२५०.५०", "रु. 900", "१८%", "नग"],
    ["२", "TL-012", "सीपीवीसी एल्बो 90°", "20 मिमी", "1,450/-", "1050", "18", "मीटर"],
  ];
  const gujarati = [
    ["ક્રમ", "કોડ", "વિગત", "સાઇઝ", "એમઆરપી", "ડીલર ભાવ", "જીએસટી %", "એકમ"],
    ["૧", "TL-011", "બોલ વાલ્વ", "15 mm", "૪૫૦", "રૂ. ૩૨૦", "૧૮", "નંગ"],
  ];

  it("finds the heading row and guesses the columns from Hindi headings", () => {
    expect(detectHeaderRow(hindi)).toBe(1);
    expect(guessColumns(hindi[1], hindi.slice(2))).toEqual({ sku: 1, product_name: 2, variant: 3, mrp: 4, purchase_cost: 5, gst_rate: 6, unit: 7 });
  });

  it("and from Gujarati headings", () => {
    expect(detectHeaderRow(gujarati)).toBe(0);
    expect(guessColumns(gujarati[0], gujarati.slice(1))).toEqual({ sku: 1, product_name: 2, variant: 3, mrp: 4, purchase_cost: 5, gst_rate: 6, unit: 7 });
  });

  it("reads native digits, rupee words and Indian number formats", () => {
    expect(parseAmount("₹ १,२५०.५०")).toBe("1250.5");
    expect(parseAmount("रु. 900")).toBe("900");
    expect(parseAmount("રૂ. ૩૨૦")).toBe("320");
    expect(parseAmount("1,450/-")).toBe("1450");
    expect(parsePercent("१८%")).toBe("18");
    expect(parsePercent("૧૨")).toBe("12");
    expect(cleanSku("TL-०११")).toBe("TL-011");
  });

  it("maps Hindi and Gujarati unit names to the shop's units", () => {
    expect(normalizeUnit("नग", UNITS)).toBe("nos");
    expect(normalizeUnit("मीटर", UNITS)).toBe("m");
    expect(normalizeUnit("सेट", UNITS)).toBe("set");
    expect(normalizeUnit("નંગ", UNITS)).toBe("nos");
    expect(normalizeUnit("લિટર", UNITS)).toBe("ltr");
    expect(normalizeUnit("કાર્ટન", UNITS)).toBe("box");
    expect(normalizeUnit("अज्ञात", UNITS)).toBe("");
  });

  it("builds import rows from a Hindi list, keeping the Hindi names", () => {
    const columns = guessColumns(hindi[1], hindi.slice(2));
    const out = buildImportRows(hindi, 1, { ...base, columns, costFrom: "column", skuFrom: "column", sellingFrom: "mrp" }, UNITS);
    expect(out.rows.map((r) => [r.product_name, r.sku, r.variant_name, r.mrp, r.purchase_cost, r.gst_rate, r.unit])).toEqual([
      ["सीपीवीसी एल्बो 90°", "TL-011", "15 मिमी", "1250.5", "900", "18", "nos"],
      ["सीपीवीसी एल्बो 90°", "TL-012", "20 मिमी", "1450", "1050", "18", "m"],
    ]);
    // The title row has a name and no price: it is a heading for the rows below only if names are not in a column.
    expect(out.skipped.map((x) => x.row)).toEqual([]);
  });

  it("makes codes for names with no Latin letters, the same each time and different for different names", () => {
    const a = autoSku("Aris", "बॉल वाल्व", "15 mm");
    expect(a).toMatch(/^ARIS-[0-9A-Z]{1,6}-15-MM$/);
    expect(autoSku("Aris", "बॉल वाल्व", "15 mm")).toBe(a);
    expect(autoSku("Aris", "બોલ વાલ્વ", "15 mm")).not.toBe(a);
  });

  it("recognises a title that is a single Hindi cell as a heading", () => {
    const rows = [["कोड", "साइज", "एमआरपी"], ["बॉल वाल्व"], ["B-1", "15 मिमी", "450"], ["B-2", "20 मिमी", "610"]];
    const out = buildImportRows(rows, 0, { ...base, columns: { sku: 0, variant: 1, mrp: 2 }, skuFrom: "column" }, UNITS);
    expect(out.rows.map((r) => [r.product_name, r.sku])).toEqual([
      ["बॉल वाल्व", "B-1"],
      ["बॉल वाल्व", "B-2"],
    ]);
  });
});
