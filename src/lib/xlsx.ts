import { strFromU8, unzipSync } from "fflate";

/**
 * Reads the first worksheet of an Excel (.xlsx) workbook as rows of text, for the bulk import.
 * Values are what Excel shows before formatting: text, numbers, TRUE/FALSE and formula results.
 * Runs in the browser, so a large or malformed file only ever costs the person uploading it.
 */
const MAX_PART_BYTES = 40_000_000;
const PARTS = /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/;

export function readXlsxRows(data: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, { filter: (f) => PARTS.test(f.name) && f.originalSize <= MAX_PART_BYTES });
  } catch {
    throw new Error("That file is not an Excel workbook (.xlsx)");
  }
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : null);
  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new Error("That file is not an Excel workbook (.xlsx)");
  const sheet = text(firstSheetPath(workbook, text("xl/_rels/workbook.xml.rels")));
  if (!sheet) throw new Error("The first sheet of the workbook could not be read");
  const shared = sharedStrings(text("xl/sharedStrings.xml"));

  const rows: string[][] = [];
  for (const [, rowBody = ""] of sheet.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    for (const [, attrs, body = ""] of rowBody.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(attrs, "r");
      const col = ref ? columnIndex(ref) : row.length;
      while (row.length < col) row.push("");
      row[col] = cellText(attr(attrs, "t"), body, shared);
    }
    rows.push(row);
  }
  return rows;
}

/** Rows as CSV text (RFC 4180), the format the import endpoint reads. */
export function toCsv(rows: string[][]): string {
  const field = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(field).join(",")).join("\r\n") + "\r\n";
}

function firstSheetPath(workbook: string, rels: string | null): string {
  const first = workbook.match(/<sheet\b[^>]*>/)?.[0];
  const id = first && attr(first, "r:id");
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
  if (type === "str") return decode(v);
  if (type === "b") return v === "1" ? "TRUE" : "FALSE";
  if (type === "e") return "";
  const n = Number(v);
  // Excel stores 1290 as e.g. 1290.0000000000002 after arithmetic; show it as Excel does.
  return Number.isFinite(n) ? String(Number(n.toPrecision(15))) : decode(v);
}

function joinedText(xml: string): string {
  return [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");
}

function attr(tag: string, name: string): string | null {
  return tag.match(new RegExp(`(?:^|\\s)${name.replace(":", "\\:")}="([^"]*)"`))?.[1] ?? null;
}

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "").toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
