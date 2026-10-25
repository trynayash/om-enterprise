/** One table read from an uploaded file: a sheet, the pages of a PDF, or a table in a document. */
export interface ImportTable {
  name: string;
  rows: string[][];
}

/** XML / HTML character references to text. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function safeCodePoint(n: number): string {
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
}

/** A number as a spreadsheet shows it: 1290.0000000000002 → "1290". */
export function numberText(n: number): string {
  return Number.isFinite(n) ? String(Number(n.toPrecision(15))) : "";
}

/** Collapse runs of spaces and trim, dropping control characters; keeps a cell's words on one line. */
export function cleanCell(s: string): string {
  return s
    .replace(/[\s\u00a0]+/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f\ufffd]/g, "")
    .trim();
}

/** Drop empty rows at the end and empty cells at the end of each row. */
export function trimTable(rows: string[][]): string[][] {
  const out = rows.map((r) => {
    let end = r.length;
    while (end > 0 && !r[end - 1]) end--;
    return r.slice(0, end);
  });
  while (out.length && !out[out.length - 1].length) out.pop();
  return out;
}

/** The value of `name="…"` in a tag's attribute text. */
export function attr(tag: string, name: string): string | null {
  return tag.match(new RegExp(`(?:^|\\s)${name.replace(/[.*+?^${}()|[\]\\:]/g, "\\$&")}="([^"]*)"`))?.[1] ?? null;
}

/** Devanagari (०–९) and Gujarati (૦–૯) digits to 0–9; price lists in Hindi and Gujarati sometimes use them. */
export function toAsciiDigits(s: string): string {
  return s.replace(/[\u0966-\u096F\u0AE6-\u0AEF]/g, (c) => String(c.charCodeAt(0) - (c.charCodeAt(0) >= 0x0ae6 ? 0x0ae6 : 0x0966)));
}
