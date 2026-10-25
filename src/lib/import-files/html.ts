import { attr, cleanCell, decodeEntities, trimTable, type ImportTable } from "./text";

/**
 * Tables in web pages (.html, .htm) — also the "Excel" files many billing and ERP systems export,
 * which are HTML tables with an .xls name. Cells spanning columns keep later columns aligned.
 */
export function readHtml(html: string): ImportTable[] {
  const body = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  const done: { caption: string; rows: string[][] }[] = [];
  const stack: { caption: string; rows: string[][]; row: string[] | null; cell: string[] | null; span: number; inCaption: boolean }[] = [];
  // Tags this reader uses, any other tag (skipped), or text.
  for (const m of body.matchAll(/<(\/?)(table|tr|td|th|br|p|div|caption)\b([^>]*)>|<[^>]*>|([^<]+)/gi)) {
    const [, closing, rawTag, attrs, text] = m;
    const top = stack[stack.length - 1];
    if (rawTag === undefined && text === undefined) continue;
    if (text !== undefined) {
      if (top?.inCaption) top.caption += decodeEntities(text);
      else if (top?.cell) top.cell.push(decodeEntities(text));
      continue;
    }
    const tag = rawTag.toLowerCase();
    if (tag === "table") {
      if (closing) {
        const t = stack.pop();
        if (t?.cell && t.row) closeCell(t);
        if (t?.row?.length) t.rows.push(t.row);
        if (t) done.push({ caption: cleanCell(t.caption), rows: t.rows });
      } else stack.push({ caption: "", rows: [], row: null, cell: null, span: 1, inCaption: false });
    } else if (!top) continue;
    else if (tag === "caption") top.inCaption = !closing;
    else if (tag === "tr") {
      if (top.cell && top.row) closeCell(top);
      if (top.row) top.rows.push(top.row);
      top.row = closing ? null : [];
    } else if (tag === "td" || tag === "th") {
      if (top.cell && top.row) closeCell(top);
      if (!closing) {
        top.row ??= [];
        top.cell = [];
        top.span = Math.min(64, Math.max(1, Number(attr(attrs.toLowerCase(), "colspan")) || Number(attrs.match(/colspan\s*=\s*['"]?(\d+)/i)?.[1]) || 1));
      }
    } else if (top.cell) top.cell.push(" ");
  }
  return done.filter((t) => t.rows.length).map((t, i) => ({ name: t.caption || `Table ${i + 1}`, rows: trimTable(t.rows) }));
}

function closeCell(t: { row: string[] | null; cell: string[] | null; span: number }) {
  t.row!.push(cleanCell(t.cell!.join("")));
  for (let i = 1; i < t.span; i++) t.row!.push("");
  t.cell = null;
}
