import { unzipSync } from "fflate";
import { decodeText, readDelimited } from "./delimited";
import { readDocx } from "./docx";
import { readHtml } from "./html";
import { readJson } from "./json";
import { readOds } from "./ods";
import type { ImportTable } from "./text";
import { isCompoundFile, readXls } from "./xls";
import { readXlsx } from "./xlsx";

export type { ImportTable } from "./text";
export { toCsv } from "./delimited";

/**
 * Reads any price list or catalogue file a supplier is likely to send, into tables of text.
 * The file's content decides how it is read, not its name: many systems export "Excel" files that
 * are really HTML or text, and files get renamed. Everything runs in the browser.
 */
export const IMPORT_ACCEPT = ".pdf,.xlsx,.xlsm,.xls,.ods,.odt,.csv,.tsv,.txt,.prn,.docx,.html,.htm,.json";
export const MAX_IMPORT_FILE_BYTES = 40 * 1024 * 1024;

export type ImportFileKind = "pdf" | "excel" | "excel-97" | "opendocument" | "word" | "web page" | "text" | "json";

/** @param onPage called after each page of a PDF is read, for a progress message. */
export async function readImportFile(name: string, bytes: Uint8Array, onPage?: (done: number, total: number) => void): Promise<{ kind: ImportFileKind; tables: ImportTable[] }> {
  if (bytes.length > MAX_IMPORT_FILE_BYTES) throw new Error("That file is larger than 40 MB — split it into smaller files.");
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const head = String.fromCharCode(...bytes.subarray(0, 1024));

  if (head.includes("%PDF-")) {
    const { readPdf } = await import("./pdf");
    return { kind: "pdf", tables: await readPdf(bytes, onPage) };
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
  if (/^(\xff\xd8\xff|\x89PNG|GIF8|RIFF[\s\S]{4}WEBP)/.test(head) || /^(jpe?g|png|gif|webp|heic|bmp|tiff?)$/.test(ext)) {
    throw new Error("Photos and scans can't be read as a price list. Ask the company for the PDF or Excel file, or type the rows into the Excel template.");
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
