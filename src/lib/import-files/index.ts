import { unzipSync } from "fflate";
import { decodeText, readDelimited } from "./delimited";
import { readDocx } from "./docx";
import { readHtml } from "./html";
import { readJson } from "./json";
import { readOds } from "./ods";
import type { ImportTable } from "./text";
import { isCompoundFile, readXls } from "./xls";
import { readXlsx } from "./xlsx";
import type { ReadOptions } from "./read-options";

export type { ImportTable } from "./text";
export { toCsv } from "./delimited";
export type { ReadOptions, ReadProgress } from "./read-options";
export { CANCELLED } from "./read-options";

/**
 * Reads any price list or catalogue file a supplier is likely to send, into tables of text.
 * The file's content decides how it is read, not its name: many systems export "Excel" files that
 * are really HTML or text, and files get renamed. Everything runs in the browser.
 */
export const IMPORT_ACCEPT = ".pdf,.xlsx,.xlsm,.xls,.ods,.odt,.csv,.tsv,.txt,.prn,.docx,.html,.htm,.json,.jpg,.jpeg,.png,.webp,.gif,.bmp";
export const MAX_IMPORT_FILE_BYTES = 40 * 1024 * 1024;

export type ImportFileKind = "pdf" | "excel" | "excel-97" | "opendocument" | "word" | "web page" | "text" | "json" | "picture";

export interface ImportFileRead {
  kind: ImportFileKind;
  tables: ImportTable[];
  /** Read from a scan or photo with text recognition, so numbers can be misread: check them. */
  scanned?: boolean;
  /** How sure the text recognition was, 0–100 (scans only). */
  confidence?: number;
}

export async function readImportFile(name: string, bytes: Uint8Array, opts: ReadOptions = {}): Promise<ImportFileRead> {
  if (bytes.length > MAX_IMPORT_FILE_BYTES) throw new Error("That file is larger than 40 MB — split it into smaller files.");
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const head = String.fromCharCode(...bytes.subarray(0, 1024));

  if (head.includes("%PDF-")) {
    const { readPdf } = await import("./pdf");
    const pdf = await readPdf(bytes, opts);
    return { kind: "pdf", ...pdf };
  }
  if (isCompoundFile(bytes)) {
    if (ext === "doc") throw new Error("Old Word files (.doc) can't be read. Open it in Word and save it as .docx or PDF.");
    return { kind: "excel-97", tables: readXls(bytes) };
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const names = zipEntries(bytes);
    if (names.has("xl/workbook.xml")) return { kind: "excel", tables: readXlsx(bytes) };
    if (names.has("xl/workbook.bin")) throw new Error("Excel binary workbooks (.xlsb) can't be read. In Excel use File → Save As → Excel Workbook (.xlsx).");
    if (names.has("word/document.xml")) return { kind: "word", tables: readDocx(bytes) };
    if (names.has("content.xml")) return { kind: "opendocument", tables: readOds(bytes) };
    if ([...names].some((n) => n.startsWith("Index/"))) throw new Error("Apple Numbers files can't be read. In Numbers use File → Export To → Excel.");
    throw new Error("That zip file is not a spreadsheet or document this importer reads.");
  }
  if (/^(\xff\xd8\xff|\x89PNG|GIF8|RIFF[\s\S]{4}WEBP|BM)/.test(head) || /^(jpe?g|png|gif|webp|bmp)$/.test(ext)) return readPicture(bytes, opts);
  if (/^(II\*\0|MM\0\*)/.test(head) || /^(tiff?|heic|heif|avif)$/.test(ext)) {
    throw new Error("That picture format can't be opened here. Save it as a JPG or PNG (or as a PDF) and upload that.");
  }

  const text = decodeText(bytes);
  const start = text.trimStart().slice(0, 2000).toLowerCase();
  if (/^</.test(start) && /<table\b/i.test(text)) {
    const tables = readHtml(text);
    if (!tables.length) throw new Error("That web page has no tables.");
    return { kind: "web page", tables };
  }
  if (ext === "json" || /^[[{]/.test(start)) {
    try {
      return { kind: "json", tables: readJson(text) };
    } catch (err) {
      if (ext === "json") throw err;
    }
  }
  return { kind: "text", tables: readDelimited(text, name.replace(/\.[^.]+$/, "") || "Table") };
}

/** A photo or scan of a price list: straightened, read with text recognition, and put into a table. */
async function readPicture(bytes: Uint8Array, opts: ReadOptions): Promise<ImportFileRead> {
  const [{ browserCanvasKit, lazyOcr, readScan }, { tablesFromPages }] = await Promise.all([import("./scan"), import("./layout")]);
  const kit = opts.canvasKit ?? browserCanvasKit;
  const ocr = lazyOcr(opts);
  try {
    const canvas = await kit.decode(bytes);
    opts.onProgress?.({ stage: "scan", done: 0, total: 1 });
    const scan = await readScan(canvas, await ocr.get(), kit);
    opts.onProgress?.({ stage: "scan", done: 1, total: 1 });
    if (!scan.page.pieces.length) throw new Error("No text could be read in that picture. Try a sharper, straighter photo with the whole page in view, or ask for the PDF or Excel file.");
    return { kind: "picture", tables: tablesFromPages([scan.page], "Picture"), scanned: true, confidence: scan.confidence };
  } finally {
    await ocr.close();
  }
}

function zipEntries(bytes: Uint8Array): Set<string> {
  const names = new Set<string>();
  try {
    unzipSync(bytes, {
      filter: (f) => {
        names.add(f.name);
        return false;
      },
    });
  } catch {
    throw new Error("That file is damaged and can't be opened.");
  }
  return names;
}
