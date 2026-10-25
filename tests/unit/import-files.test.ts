import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { readImportFile } from "@/lib/import-files";
import { buildImportRows, detectHeaderRow, guessColumns, type ImportRow, type MappingSettings, type SourceField } from "@/lib/import-files/mapping";

/**
 * One price list (tests/fixtures/import/README.md) saved in every format a supplier sends: each
 * must give exactly the rows the Excel file gives.
 */
const dir = join(__dirname, "../fixtures/import");
const read = (name: string) => readImportFile(name, new Uint8Array(readFileSync(join(dir, name))));

const settings = (columns: Partial<Record<SourceField, number>>): MappingSettings => ({
  columns,
  category: "cpvc-pipes-fittings",
  brand: "Testline",
  unit: "pcs",
  gstRate: "18",
  hsnCode: "3917",
  priceIncludesTax: true,
  sellingFrom: "mrp",
  sellingLessPercent: "",
  costFrom: "column",
  costLessPercent: "",
  costIncludesTax: false,
  skuFrom: "column",
  skuPrefix: "",
  fillDown: true,
  skipWithoutPrice: true,
  sourceInfo: "",
});

async function importRows(name: string) {
  const { kind, tables } = await read(name);
  const t = tables[0];
  const h = detectHeaderRow(t.rows);
  const columns = guessColumns(t.rows[h], t.rows.slice(h + 1, h + 41));
  return { kind, tables, header: t.rows[h], columns, ...buildImportRows(t.rows, h, settings(columns), ["pcs", "nos", "m"]) };
}

// LibreOffice writes Hindi into PDFs as glyphs out of reading order; only that product's name differs.
const comparable = (rows: ImportRow[]) => rows.map((r) => ({ ...r, product_name: /[ऀ-ॿ]/.test(r.product_name) ? "(Hindi)" : r.product_name }));

describe("one price list in every format", () => {
  it("Excel workbook: 30 products in 4 sizes, named by the heading rows", async () => {
    const x = await importRows("pricelist.xlsx");
    expect(x.kind).toBe("excel");
    expect(x.tables.map((t) => t.name)).toEqual(["Price List", "Terms"]);
    expect(x.header).toEqual(["Sr. No", "Item Code", "Description", "Size", "MRP (₹)", "Dealer Price", "GST %", "Remarks"]);
    expect(x.columns).toEqual({ sku: 1, product_name: 2, variant: 3, mrp: 4, purchase_cost: 5, gst_rate: 6, description: 7 });
    expect(x.rows).toHaveLength(120);
    expect(new Set(x.rows.map((r) => r.product_name)).size).toBe(30);
    expect(x.rows[0]).toMatchObject({
      product_name: "CPVC Elbow 90°",
      sku: "TL-011",
      variant_name: '15 mm (1/2")',
      variant_attributes: 'Size=15 mm (1/2")',
      mrp: "8.5",
      selling_price: "8.5",
      purchase_cost: "6.12",
      gst_rate: "18",
      description: "Std. pack 25 pcs; carton 200; ISI marked, lead-free compound, item 1-1",
    });
    // GST written as 0.18 in the sheet.
    expect(x.rows[4]).toMatchObject({ sku: "TL-021", gst_rate: "18" });
    expect(x.skipped.filter((s) => s.reason.startsWith("Heading"))).toHaveLength(30);
  });

  it.each([
    ["pricelist.xls", "excel-97"],
    ["pricelist.ods", "opendocument"],
    ["pricelist.docx", "word"],
    ["pricelist.html", "web page"],
    ["pricelist.csv", "text"],
    ["pricelist.pdf", "pdf"],
    ["pricelist-chrome.pdf", "pdf"],
    ["pricelist-word.pdf", "pdf"],
  ])("%s gives the same rows", async (name, kind) => {
    const [base, other] = await Promise.all([importRows("pricelist.xlsx"), importRows(name)]);
    expect(other.kind).toBe(kind);
    expect(comparable(other.rows)).toEqual(comparable(base.rows));
  });

  it("PDF pages are offered together and one by one", async () => {
    const { tables } = await read("pricelist.pdf");
    expect(tables.map((t) => t.name)).toEqual(["All pages", "Page 1", "Page 2", "Page 3", "Page 4", "Page 5", "Page 6"]);
  });
});

describe("PDF layouts", () => {
  it("a catalogue: a small table under each product's name, wrapped descriptions, shaded rows", async () => {
    const x = await importRows("catalogue.pdf");
    // The long "Description" column describes each size; the headings name the products.
    expect(x.columns.product_name).toBeUndefined();
    expect(x.columns.description).toBe(2);
    expect(x.rows).toHaveLength(24);
    expect([...new Set(x.rows.map((r) => r.product_name))]).toEqual(["uPVC Column Pipe", "SWR Pipe Type A", expect.stringMatching(/^Agri Pipe 4 kg\/cm/), "Garden Hose Braided"]);
    expect(x.rows[0]).toMatchObject({
      sku: "PVC-001",
      variant_name: "25 mm",
      description: "uPVC Column Pipe 25 mm, ISI marked, UV stabilised. Length 3 m with socket; 1 per bundle",
      mrp: "100",
    });
    expect(x.skipped.filter((s) => s.reason === "Repeated header")).toHaveLength(3);
  });

  it("a page turned sideways, with borders and letters drawn one at a time", async () => {
    const { tables } = await read("grid-rotated.pdf");
    expect(tables[0].rows.slice(0, 3)).toEqual([
      ["ASTRA FITTINGS NET RATE LIST", "", "", "", ""],
      ["Sr", "Product", "Size", "MRP", "Net Rate"],
      ["1", "Ball Valve Brass 1", "15 mm", "Rs. 450.00", "270.00"],
    ]);
  });

  it("explains password-protected and scanned PDFs", async () => {
    await expect(read("password.pdf")).rejects.toThrow(/password-protected/);
    await expect(read("scan.pdf")).rejects.toThrow(/scan or a photo/);
  });
});

describe("readImportFile", () => {
  const bytes = (s: string) => strToU8(s);

  it("goes by the content, not the name: an 'Excel' export that is really a web page", async () => {
    const html =
      "<html><body><table><caption>Stock</caption><tr><th>Item</th><th colspan=2>MRP</th><th>Unit</th></tr><tr><td>Tap <b>chrome</b></td><td>450</td><td>/-</td><td>pcs</td></tr></table></body></html>";
    const { kind, tables } = await readImportFile("export.xls", bytes(html));
    expect(kind).toBe("web page");
    expect(tables).toEqual([
      {
        name: "Stock",
        rows: [
          ["Item", "MRP", "", "Unit"],
          ["Tap chrome", "450", "/-", "pcs"],
        ],
      },
    ]);
  });

  it("reads Excel 'Unicode text' (UTF-16, tabs) and semicolon CSV", async () => {
    const utf16 = new Uint8Array([0xff, 0xfe, ...Array.from("Item\tMRP\r\nTap ₹\t450\r\n").flatMap((c) => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8])]);
    expect((await readImportFile("list.txt", utf16)).tables[0].rows).toEqual([
      ["Item", "MRP"],
      ["Tap ₹", "450"],
    ]);
    expect((await readImportFile("list.csv", bytes("Item;MRP\nTap;450\nValve;1.290\n"))).tables[0].rows).toEqual([
      ["Item", "MRP"],
      ["Tap", "450"],
      ["Valve", "1.290"],
    ]);
    // Older Excel writes Windows-1252.
    expect((await readImportFile("list.csv", new Uint8Array([0x45, 0x6c, 0x62, 0x6f, 0x77, 0x20, 0x39, 0x30, 0xb0, 0x2c, 0x31]))).tables[0].rows).toEqual([["Elbow 90°", "1"]]);
  });

  it("reads JSON records", async () => {
    const { kind, tables } = await readImportFile(
      "feed.json",
      bytes(
        JSON.stringify({
          products: [
            { name: "Tap", mrp: 450.5 },
            { name: "Valve", sizes: ["15", "20"] },
          ],
        }),
      ),
    );
    expect(kind).toBe("json");
    expect(tables).toEqual([
      {
        name: "products",
        rows: [
          ["name", "mrp", "sizes"],
          ["Tap", "450.5", ""],
          ["Valve", "", '["15","20"]'],
        ],
      },
    ]);
  });

  it("says what to do with files it can't read", async () => {
    const cfb = new Uint8Array(1024);
    cfb.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(readImportFile("letter.doc", cfb)).rejects.toThrow(/Old Word files/);
    await expect(readImportFile("book.xlsb", zipSync({ "xl/workbook.bin": bytes("x") }))).rejects.toThrow(/\.xlsb/);
    await expect(readImportFile("list.numbers", zipSync({ "Index/Document.iwa": bytes("x") }))).rejects.toThrow(/Numbers/);
    await expect(readImportFile("photo.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).rejects.toThrow(/Photos and scans/);
    await expect(readImportFile("broken.json", bytes("{nope"))).rejects.toThrow(/not valid JSON/);
  });
});
