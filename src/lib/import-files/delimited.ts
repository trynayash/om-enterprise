import { trimTable, type ImportTable } from "./text";

/**
 * Text tables: .csv, .tsv, .txt and "Unicode text" saved from Excel. The delimiter (comma,
 * semicolon, tab or pipe) and the encoding (UTF-8, UTF-16 with a byte-order mark, or the
 * Windows-1252 that older Excel versions write) are detected.
 */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const DELIMITERS = [",", ";", "\t", "|"] as const;

export function readDelimited(text: string, name = "Table"): ImportTable[] {
  const sample = text
    .split(/\r\n|\n|\r/)
    .slice(0, 40)
    .join("\n");
  let best: { d: string; score: number } = { d: ",", score: -1 };
  for (const d of DELIMITERS) {
    const counts = parseDelimited(sample, d)
      .filter((r) => r.some((c) => c.trim()))
      .map((r) => r.length);
    if (!counts.length) continue;
    const freq = new Map<number, number>();
    for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1);
    const [width, times] = [...freq].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    // Rows that agree on one width > 1, weighted by how wide the table is.
    const score = width > 1 ? (times / counts.length) * Math.log2(width + 1) : 0;
    if (score > best.score) best = { d, score };
  }
  return [{ name, rows: trimTable(parseDelimited(text, best.d)) }];
}

/** RFC 4180 parsing for any one-character delimiter: quoted fields, doubled quotes, CRLF/LF/CR. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field.trim() === "") {
      quoted = true;
      field = "";
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Rows as CSV text (RFC 4180), the format the import endpoint reads. */
export function toCsv(rows: string[][]): string {
  const field = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(field).join(",")).join("\r\n") + "\r\n";
}
