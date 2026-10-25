import { strFromU8, unzipSync } from "fflate";
import { attr, decodeEntities, numberText, trimTable, type ImportTable } from "./text";

/**
 * Excel workbooks (.xlsx, .xlsm): every worksheet as rows of text, in workbook order.
 * Values are what Excel stores before formatting: text, numbers, TRUE/FALSE and formula results.
 */
const MAX_PART_BYTES = 40_000_000;
const PARTS = /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/;

export function readXlsx(data: Uint8Array): ImportTable[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, { filter: (f) => PARTS.test(f.name) && f.originalSize <= MAX_PART_BYTES });
  } catch {
    throw new Error("That file is not an Excel workbook (.xlsx)");
  }
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : null);
  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new Error("That file is not an Excel workbook (.xlsx)");
  const shared = sharedStrings(text("xl/sharedStrings.xml"));
  const rels = text("xl/_rels/workbook.xml.rels");

  const tables: ImportTable[] = [];
  for (const [tag] of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const sheet = text(sheetPath(attr(tag, "r:id"), rels));
    if (sheet === null) continue;
    tables.push({ name: decodeEntities(attr(tag, "name") ?? `Sheet ${tables.length + 1}`), rows: trimTable(sheetRows(sheet, shared)) });
  }
  if (!tables.length) {
    const first = text("xl/worksheets/sheet1.xml");
    if (first === null) throw new Error("The workbook has no sheet that could be read");
    tables.push({ name: "Sheet 1", rows: trimTable(sheetRows(first, shared)) });
  }
  return tables;
}

function sheetRows(sheet: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const [, rowAttrs, rowBody = ""] of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    // Keep Excel's row numbers so a row in an error report is the row the person sees.
    const r = Number(attr(rowAttrs, "r"));
    if (Number.isInteger(r) && r > rows.length + 1 && r - rows.length < 100_000) while (rows.length < r - 1) rows.push([]);
    const row: string[] = [];
    for (const [, attrs, body = ""] of rowBody.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(attrs, "r");
      const col = ref ? columnIndex(ref) : row.length;
      if (col > 16_383) continue;
      while (row.length < col) row.push("");
      row[col] = cellText(attr(attrs, "t"), body, shared);
    }
    rows.push(row);
  }
  return rows;
}

function sheetPath(id: string | null, rels: string | null): string {
  const rel = id && rels ? [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => attr(r, "Id") === id) : null;
  const target = rel && attr(rel, "Target");
  if (!target) return "xl/worksheets/sheet1.xml";
  return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
}

function sharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, si]) => joinedText(si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "")));
}

function cellText(type: string | null, body: string, shared: string[]): string {
  if (type === "inlineStr") return joinedText(body);
  const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
  if (v === undefined) return "";
  if (type === "s") return shared[Number(v)] ?? "";
  if (type === "str") return decodeEntities(v);
  if (type === "b") return v === "1" ? "TRUE" : "FALSE";
  if (type === "e") return "";
  const n = Number(v);
  return Number.isFinite(n) ? numberText(n) : decodeEntities(v);
}

function joinedText(xml: string): string {
  return [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeEntities(m[1])).join("");
}

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "").toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}
