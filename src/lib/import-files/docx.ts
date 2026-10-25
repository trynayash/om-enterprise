import { strFromU8, unzipSync } from "fflate";
import { attr, cleanCell, decodeEntities, trimTable, type ImportTable } from "./text";

/**
 * Word documents (.docx): every table, in document order. Merged cells repeat nothing (the
 * extra grid positions are left blank) so columns stay aligned. Nested tables become tables of
 * their own.
 */
export function readDocx(data: Uint8Array): ImportTable[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, { filter: (f) => f.name === "word/document.xml" && f.originalSize <= 80_000_000 });
  } catch {
    throw new Error("That file is not a Word document (.docx)");
  }
  if (!files["word/document.xml"]) throw new Error("That file is not a Word document (.docx)");
  const tables = wordTables(strFromU8(files["word/document.xml"]));
  if (!tables.length) throw new Error("That Word document has no tables. Price lists need to be in a table to be imported.");
  return tables.map((rows, i) => ({ name: `Table ${i + 1}`, rows: trimTable(rows) }));
}

function wordTables(xml: string): string[][][] {
  const done: string[][][] = [];
  const stack: { rows: string[][]; row: string[] | null; cell: string[] | null; span: number }[] = [];
  const tokens = /<(\/?)w:(tbl|tr|tc|t|tab|br|p|gridSpan)\b([^>]*?)(\/?)>|([^<]+)/g;
  let inText = false;
  for (const m of xml.matchAll(tokens)) {
    const [, closing, tag, attrs, selfClosing, text] = m;
    const top = stack[stack.length - 1];
    if (text !== undefined) {
      if (inText && top?.cell) top.cell.push(decodeEntities(text));
      continue;
    }
    if (tag === "tbl") {
      if (closing) {
        const t = stack.pop();
        if (t) done.push(t.rows);
      } else stack.push({ rows: [], row: null, cell: null, span: 1 });
    } else if (!top) continue;
    else if (tag === "tr") {
      if (closing) {
        if (top.row) top.rows.push(top.row);
        top.row = null;
      } else top.row = [];
    } else if (tag === "tc") {
      if (closing) {
        if (top.row && top.cell) {
          top.row.push(cleanCell(top.cell.join("")));
          for (let i = 1; i < top.span; i++) top.row.push("");
        }
        top.cell = null;
      } else {
        top.cell = [];
        top.span = 1;
      }
    } else if (tag === "gridSpan" && top.cell) top.span = Math.min(64, Math.max(1, Number(attr(attrs, "w:val")) || 1));
    else if (tag === "t") inText = !closing && !selfClosing;
    else if ((tag === "tab" || tag === "br" || (tag === "p" && closing)) && top.cell) top.cell.push(" ");
  }
  return done.filter((t) => t.length > 0);
}
