import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readImportFile, type ReadOptions } from "@/lib/import-files";
import { buildImportRows, detectHeaderRow, guessColumns, type ImportRow, type MappingSettings, type SourceField } from "@/lib/import-files/mapping";
import type { CanvasKit } from "@/lib/import-files/scan";
import type { ImportTable } from "@/lib/import-files";

const root = join(__dirname, "../..");
export const fixture = (name: string) => new Uint8Array(readFileSync(join(root, "tests/fixtures/import", name)));

/** Node's canvases, in place of the browser's. */
export const nodeCanvasKit: CanvasKit = {
  create: (w, h) => createCanvas(w, h) as never,
  async decode(bytes) {
    const img = await loadImage(Buffer.from(bytes));
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, img.width, img.height);
    ctx.drawImage(img, 0, 0);
    return canvas as never;
  },
};

/** The recognition engine and decoders from node_modules, as the browser gets them from /ocr/ and /pdfjs/. */
export const nodeReadOptions = (extra: ReadOptions = {}): ReadOptions => ({
  canvasKit: nodeCanvasKit,
  ocr: { langPath: join(root, "node_modules/@tesseract.js-data/eng/4.0.0_best_int") },
  pdfWasmUrl: join(root, "node_modules/pdfjs-dist/wasm") + "/",
  ...extra,
});

export const readFixture = (name: string, extra: ReadOptions = {}) => readImportFile(name, fixture(name), nodeReadOptions(extra));

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

/** The import rows for the first table, columns guessed from its headings. */
export function importRowsOf(tables: ImportTable[]) {
  const t = tables[0];
  const h = detectHeaderRow(t.rows);
  const columns = guessColumns(t.rows[h] ?? [], t.rows.slice(h + 1, h + 41), h > 0 ? t.rows[h - 1] : []);
  return { header: t.rows[h] ?? [], columns, ...buildImportRows(t.rows, h, settings(columns), ["pcs", "nos", "m"]) };
}

const squash = (s: string) => s.replace(/[\s"”″']/g, "");

/** How many scanned rows have the Excel file's code, prices, GST, name and size (spaces and inch marks aside). */
export function compareToExcel(rows: ImportRow[], truth: ImportRow[]) {
  const byCode = new Map(truth.map((r) => [r.sku, r]));
  let known = 0;
  let exact = 0;
  const misses: string[] = [];
  for (const r of rows) {
    const t = byCode.get(r.sku);
    if (!t) continue;
    known++;
    const wrong = (["mrp", "purchase_cost", "gst_rate"] as const).filter((k) => r[k] !== t[k]);
    const same = !wrong.length && squash(r.product_name) === squash(t.product_name) && squash(r.variant_name) === squash(t.variant_name);
    if (same) exact++;
    else misses.push(`${r.sku}: ${wrong.map((k) => `${k} ${r[k]} ≠ ${t[k]}`).join(", ") || "name or size"}`);
  }
  return { known, exact, misses };
}
