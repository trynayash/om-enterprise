import { strFromU8, unzipSync } from "fflate";
import { attr, decodeEntities, numberText, trimTable, type ImportTable } from "./text";

/**
 * OpenDocument spreadsheets (.ods, from LibreOffice, Google Sheets or WPS): every sheet as rows
 * of text. Repeated rows and cells are expanded, except the long blank runs these files use to
 * fill out a sheet, which are only kept when something follows them.
 */
const MAX_REPEAT = 10_000;

export function readOds(data: Uint8Array): ImportTable[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, { filter: (f) => f.name === "content.xml" && f.originalSize <= 80_000_000 });
  } catch {
    throw new Error("That file is not an OpenDocument spreadsheet (.ods)");
  }
  if (!files["content.xml"]) throw new Error("That file is not an OpenDocument spreadsheet (.ods)");
  const xml = strFromU8(files["content.xml"]);
  const tables: ImportTable[] = [];
  for (const [, tableAttrs, body] of xml.matchAll(/<table:table\b([^>]*)>([\s\S]*?)<\/table:table>/g)) {
    tables.push({ name: decodeEntities(attr(tableAttrs, "table:name") ?? `Sheet ${tables.length + 1}`), rows: trimTable(rowsOf(body)) });
  }
  if (!tables.length) throw new Error("The spreadsheet has no sheets");
  return tables;
}

function rowsOf(table: string): string[][] {
  const rows: string[][] = [];
  let blankRows = 0;
  for (const [, rowAttrs, body = ""] of table.matchAll(/<table:table-row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-row>)/g)) {
    const row = cellsOf(body);
    const repeat = Math.max(1, Number(attr(rowAttrs, "table:number-rows-repeated")) || 1);
    if (!row.some(Boolean)) {
      blankRows += repeat;
      continue;
    }
    for (let i = 0; i < Math.min(blankRows, MAX_REPEAT); i++) rows.push([]);
    blankRows = 0;
    for (let i = 0; i < Math.min(repeat, MAX_REPEAT); i++) rows.push([...row]);
  }
  return rows;
}

function cellsOf(row: string): string[] {
  const cells: string[] = [];
  let blankCells = 0;
  for (const [, , attrs, body = ""] of row.matchAll(/<table:(table-cell|covered-table-cell)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:\1>)/g)) {
    const value = cellValue(attrs, body);
    const repeat = Math.max(1, Number(attr(attrs, "table:number-columns-repeated")) || 1);
    if (!value) {
      blankCells += repeat;
      continue;
    }
    for (let i = 0; i < Math.min(blankCells, 1024); i++) cells.push("");
    blankCells = 0;
    for (let i = 0; i < Math.min(repeat, 1024); i++) cells.push(value);
  }
  return cells;
}

function cellValue(attrs: string, body: string): string {
  const type = attr(attrs, "office:value-type");
  if (type === "float" || type === "percentage" || type === "currency") {
    const n = Number(attr(attrs, "office:value"));
    if (Number.isFinite(n)) return numberText(n);
  }
  if (type === "boolean") return attr(attrs, "office:boolean-value") === "true" ? "TRUE" : "FALSE";
  if (type === "date") return attr(attrs, "office:date-value") ?? "";
  return [...body.matchAll(/<text:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/text:p>)/g)]
    .map(([, p = ""]) => paragraph(p))
    .filter(Boolean)
    .join(" ");
}

function paragraph(p: string): string {
  return decodeEntities(
    p
      .replace(/<text:s\b[^>]*?text:c="(\d+)"[^>]*\/>/g, (_, n) => " ".repeat(Math.min(Number(n), 50)))
      .replace(/<text:(s|tab|line-break)\b[^>]*\/>/g, " ")
      .replace(/<[^>]+>/g, ""),
  ).trim();
}
