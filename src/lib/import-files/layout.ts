import { cleanCell, type ImportTable } from "./text";

/**
 * Rebuilds tables from positioned text (PDF text runs). Works like the "stream" mode of
 * table extractors such as Tabula and Camelot: text on one baseline makes a line; columns are the
 * bands of the page that the lines' text runs cover, separated by vertical runs of white space;
 * each run goes to its band and runs in one band are one cell. Runs (not words) are used because
 * PDFs made from spreadsheets put a right-aligned number only a few points from the left-aligned
 * text of the next column. Wrapped text in a cell is joined back to its row when the row spacing
 * shows it is a continuation.
 *
 * When the table has borders ("lattice" mode) they are used too: the lines between two horizontal
 * borders are one row, however many lines a cell wraps to, and no column crosses a vertical border.
 * Without borders, lines set closer together than the rows are one row when only one of them
 * holds the row's values — which joins wrapped cells whether they are aligned to the top, middle
 * or bottom of the row.
 */
export interface TextPiece {
  /** Left edge, from the left of the page. */
  x: number;
  /** Baseline, from the top of the page. */
  y: number;
  w: number;
  /** Font size. */
  h: number;
  str: string;
  /** Cut off at the right edge of its cell, so the next piece belongs to another cell. */
  cut?: boolean;
}

/** A straight horizontal or vertical line drawn on the page, from the top-left of the page. */
export interface Rule {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** How thick the line is drawn, when known (scans). */
  width?: number;
}

export interface PageText {
  pieces: TextPiece[];
  rules?: Rule[];
}

interface Chunk {
  x: number;
  end: number;
  h: number;
  text: string;
  cut?: boolean;
}
interface Line {
  y: number;
  h: number;
  page: number;
  chunks: Chunk[];
  /** Lines with the same id lie between the same two horizontal borders: one table row. */
  row?: string;
}

/** One table for all pages together, and one per page when there are several. */
export function tablesFromPages(pages: PageText[], name = "All pages"): ImportTable[] {
  const perPage = pages.map((p, page) => {
    const lines = linesOf(p.pieces, page);
    markRuledRows(lines, page, (p.rules ?? []).filter(isHorizontal));
    markSpacedRows(lines, page);
    return lines;
  });
  const all = perPage.flat();
  if (!all.length) return [];
  const splits = columnRules(
    pages.flatMap((p) => (p.rules ?? []).filter(isVertical)),
    all,
  );
  const tables = [{ name: pages.length > 1 ? name : "Page 1", rows: rowsOf(all, splits) }];
  if (pages.length > 1) perPage.forEach((lines, i) => lines.length && tables.push({ name: `Page ${i + 1}`, rows: rowsOf(lines, splits) }));
  return tables;
}

function linesOf(items: TextPiece[], page: number): Line[] {
  const sorted = items.filter((i) => i.str.trim() && Number.isFinite(i.x) && Number.isFinite(i.y)).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: { y: number; h: number; items: TextPiece[] }[] = [];
  for (const it of sorted) {
    const h = it.h > 0 ? it.h : 10;
    const last = lines[lines.length - 1];
    if (last && Math.abs(it.y - last.y) <= Math.max(1.5, 0.4 * Math.min(last.h, h))) {
      last.items.push(it);
      last.h = Math.max(last.h, h);
    } else lines.push({ y: it.y, h, items: [it] });
  }
  return lines.map((l) => ({ y: l.y, h: l.h, page, chunks: chunksOf(l.items) })).filter((l) => l.chunks.length);
}

/** Text runs on a line; runs that touch (a word split by a font change) are joined. */
function chunksOf(items: TextPiece[]): Chunk[] {
  const out: Chunk[] = [];
  for (const it of [...items].sort((a, b) => a.x - b.x)) {
    const h = it.h > 0 ? it.h : 10;
    const w = Math.max(0, it.w || it.str.length * h * 0.5);
    const prev = out[out.length - 1];
    const gap = prev ? it.x - prev.end : Infinity;
    if (prev && !prev.cut && gap <= 0.12 * Math.max(prev.h, h)) {
      const needsSpace = gap > 0.12 * h && !/\s$/.test(prev.text) && !/^\s/.test(it.str);
      prev.text += (needsSpace ? " " : "") + it.str;
      prev.end = Math.max(prev.end, it.x + w);
      prev.h = Math.max(prev.h, h);
      prev.cut = it.cut;
    } else out.push({ x: it.x, end: it.x + w, h, text: it.str, cut: it.cut });
  }
  return out.map((c) => ({ ...c, text: cleanCell(c.text) })).filter((c) => c.text);
}

const isHorizontal = (r: Rule) => Math.abs(r.y1 - r.y0) <= 1 && Math.abs(r.x1 - r.x0) >= 4;
const isVertical = (r: Rule) => Math.abs(r.x1 - r.x0) <= 1 && Math.abs(r.y1 - r.y0) >= 2;

/**
 * Gives the lines between the same two horizontal borders the same row id — when the borders
 * really mark rows: at least three bordered rows, most of them only a line or two high (a box
 * round a whole table or a line under the header leaves the rows to the spacing rules).
 */
function markRuledRows(lines: Line[], page: number, rules: Rule[]) {
  if (rules.length < 2) return;
  const slots = new Map<string, Line[]>();
  for (const l of lines) {
    const x0 = Math.min(...l.chunks.map((c) => c.x));
    const x1 = Math.max(...l.chunks.map((c) => c.end));
    const across = rules.filter((r) => Math.min(r.x0, r.x1) < x1 && Math.max(r.x0, r.x1) > x0);
    const ys = across.map((r) => (r.y0 + r.y1) / 2);
    const above = Math.max(-Infinity, ...ys.filter((y) => y <= l.y - 0.5 * l.h));
    const below = Math.min(Infinity, ...ys.filter((y) => y >= l.y - 0.1 * l.h));
    if (!Number.isFinite(above) || !Number.isFinite(below)) continue;
    const key = `${page}:${above.toFixed(1)}:${below.toFixed(1)}`;
    slots.set(key, [...(slots.get(key) ?? []), l]);
  }
  const sizes = [...slots.values()].map((ls) => ls.length).sort((a, b) => a - b);
  if (sizes.length < 3 || sizes[Math.floor(sizes.length / 2)] > 2) return;
  for (const [key, ls] of slots) for (const l of ls) l.row = key;
}

/**
 * Rows from spacing: a run of lines each within a line's spacing of the one before is one row
 * when at most one of them has numbers in it and at most one has three or more cells (the line
 * with the row's values; the others are wrapped text). The line spacing is the smallest gap that
 * keeps coming back; with no wrapped cells it is the row spacing and every run is a whole table.
 */
function markSpacedRows(lines: Line[], page: number) {
  const gaps = lines
    .slice(1)
    .map((l, i) => l.y - lines[i].y)
    .filter((g) => g > 0);
  const pitch = linePitch(gaps);
  if (!pitch) return;
  let run: Line[] = [];
  const flush = () => {
    const valued = run.filter((l) => l.chunks.some((c) => NUMERIC.test(c.text))).length;
    const wide = run.filter((l) => l.chunks.length >= 3).length;
    if (run.length > 1 && run.length <= 8 && valued <= 1 && wide <= 1) for (const l of run) l.row = `s:${page}:${run[0].y}`;
    run = [];
  };
  for (const l of lines) {
    const prev = run[run.length - 1];
    if (l.row !== undefined) {
      flush();
      continue;
    }
    if (prev && l.y - prev.y > pitch * 1.15 + 0.5) flush();
    run.push(l);
  }
  flush();
}

/** The smallest gap between lines that occurs again and again (at least twice, and in 3% of the gaps). */
function linePitch(gaps: number[]): number | null {
  const sorted = [...gaps].sort((a, b) => a - b);
  const need = Math.max(2, Math.ceil(sorted.length * 0.03));
  for (const g of sorted) {
    if (sorted.filter((x) => Math.abs(x - g) <= 0.5).length >= need) return g;
  }
  return null;
}

/** Column edges from vertical borders: the x of every vertical border that runs at least a couple of lines in total, left to right. */
function columnRules(rules: Rule[], lines: Line[]): number[] {
  if (!rules.length) return [];
  const heights = lines.map((l) => l.h).sort((a, b) => a - b);
  const h = heights[Math.floor(heights.length / 2)] ?? 10;
  // The same border on different pages (scans never line up exactly) is one border, if within about half a line of text.
  const tol = Math.max(2, 0.45 * h);
  const xs = rules.map((r) => ({ x: (r.x0 + r.x1) / 2, len: Math.abs(r.y1 - r.y0) })).sort((a, b) => a.x - b.x);
  const groups: { x: number; len: number }[] = [];
  for (const r of xs) {
    const g = groups[groups.length - 1];
    if (g && r.x - g.x <= tol) {
      g.x = (g.x * g.len + r.x * r.len) / (g.len + r.len);
      g.len += r.len;
    } else groups.push({ ...r });
  }
  return groups.filter((g) => g.len >= 2 * h).map((g) => g.x);
}

function rowsOf(lines: Line[], splits: number[]): string[][] {
  const columns = columnsOf(lines, splits);
  const pitch = rowPitch(lines);
  const rows: { cells: string[]; line: Line }[] = [];
  for (const line of lines) {
    const cells: string[] = columns.map(() => "");
    for (const c of line.chunks) {
      const col = columnFor(c, columns, splits);
      cells[col] = cells[col] ? `${cells[col]} ${c.text}` : c.text;
    }
    const prev = rows[rows.length - 1];
    const sameRow = !!prev && line.row !== undefined && line.row === prev.line.row;
    if (prev && (sameRow || (line.row === undefined && pitch && isContinuation(line, prev, cells, pitch)))) {
      cells.forEach((v, i) => v && (prev.cells[i] = prev.cells[i] ? `${prev.cells[i]} ${v}` : v));
      prev.line = { ...line, chunks: prev.line.chunks };
      continue;
    }
    rows.push({ cells, line });
  }
  // Columns no cell uses are dropped.
  const used = columns.map((_, i) => rows.some((r) => r.cells[i]));
  return rows.map((r) => r.cells.filter((_, i) => used[i]));
}

/**
 * Column bands. First pass: bands covered by the lines that have several cells; a gap is real if
 * at most a tenth of those lines cross it. Second pass: drop the cells that cross a real gap
 * (titles spanning the table), then take every band any remaining cell covers, so sparse
 * columns are kept.
 */
function columnsOf(lines: Line[], splits: number[]): [number, number][] {
  const multi = lines.filter((l) => l.chunks.length >= 2).flatMap((l) => l.chunks);
  const source = multi.length ? multi : lines.flatMap((l) => l.chunks);
  const strong = bands(source, Math.floor(lines.filter((l) => l.chunks.length >= 2).length * 0.1));
  const kept = source.filter((c) => bandsTouched(c, strong) <= 1);
  const final = mergeSparseBands(mergeUnitBands(splitAtRules(bands(kept.length ? kept : source, 0), splits), lines), lines, splits);
  return final.length ? final : [[0, Infinity]];
}

/** A band that runs across a vertical border is two columns. */
function splitAtRules(cols: [number, number][], splits: number[]): [number, number][] {
  return cols.flatMap(([a, b]) => {
    const inside = splits.filter((x) => x > a + 1 && x < b - 1);
    const edges = [a, ...inside, b];
    return inside.map((_, i) => [edges[i], edges[i + 1]] as [number, number]).concat([[edges[edges.length - 2], b]]);
  });
}

/**
 * Values aligned differently within one column make two bands: a heading on the left over numbers
 * on the right ("Sr. No" over 1, 2, 3), or text on the left and numbers on the right ("18%" and
 * 0.18). Two neighbouring bands that are never used on the same line and sit close together are
 * one column when a text run covers both (the heading over a mixed column), or when one of them is
 * only used on a few lines that have other cells too (a heading row). Bands used together on only
 * a few lines, where their text is a word space apart, are a heading split into words over one
 * column. Bands are never joined across a vertical border.
 */
function mergeSparseBands(cols: [number, number][], lines: Line[], splits: number[]): [number, number][] {
  let out = cols.map(([a, b]) => [a, b] as [number, number]);
  const h = lines.reduce((n, l) => n + l.h, 0) / Math.max(1, lines.length) || 10;
  const touches = (c: Chunk, [a, b]: [number, number]) => Math.min(b, c.end) - Math.max(a, c.x) > 0.5;
  for (let changed = true; changed && out.length > 1; ) {
    changed = false;
    const used = out.map(() => new Set<number>());
    lines.forEach((l, li) => l.chunks.forEach((c) => used[columnFor(c, out, splits)].add(li)));
    let best = -1;
    let bestGap = Infinity;
    for (let i = 0; i + 1 < out.length; i++) {
      const [a, b] = [used[i], used[i + 1]];
      const gap = out[i + 1][0] - out[i][1];
      if (gap >= 2.5 * h || gap >= bestGap) continue;
      if (splits.some((x) => x >= out[i][1] - 1 && x <= out[i + 1][0] + 1)) continue;
      const small = a.size <= b.size ? a : b;
      const few = small.size <= Math.max(1, Math.floor(Math.max(a.size, b.size) * 0.1)) && [...small].every((li) => lines[li].chunks.length >= 2);
      const both = [...a].filter((li) => b.has(li));
      const wordApart = (max: number) =>
        both.every((li) => {
          const l = lines[li];
          const left = l.chunks.filter((c) => columnFor(c, out, splits) === i).sort((x, y) => y.end - x.end)[0];
          const right = l.chunks.filter((c) => columnFor(c, out, splits) === i + 1).sort((x, y) => x.x - y.x)[0];
          return !!left && !!right && !left.cut && right.x - left.end <= max * l.h;
        });
      // Inside one cell of a table with borders between its columns (PDFs that place every word
      // or letter on its own): words of one cell.
      const inCell = splits.length >= 3 && splits[0] <= out[i][0] + 1 && splits[splits.length - 1] >= out[i + 1][1] - 1;
      let join: boolean;
      if (both.length) {
        // A heading split into words over a column: the bands are used together only on a few
        // lines, and there the text in them is only a word space apart.
        join = (inCell && wordApart(0.7)) || (both.length <= Math.max(1, Math.floor(Math.min(a.size, b.size) * 0.1)) && wordApart(0.3));
      } else {
        const bridged = lines.some((l) => l.chunks.some((c) => touches(c, out[i]) && touches(c, out[i + 1])));
        join = few || bridged;
      }
      if (join) {
        best = i;
        bestGap = gap;
      }
    }
    if (best >= 0) {
      out = [...out.slice(0, best), [out[best][0], out[best + 1][1]], ...out.slice(best + 2)];
      changed = true;
    }
  }
  return out;
}

const UNIT_WORD = /^(mm|cm|m|mtr|inch|in|"|”|ft|ltr|l|ml|kg|gm|g|%|nos|pcs|no|sq\.?\s?ft)$/i;

/**
 * A narrow band holding only unit words ("mm", "kg", "%") right after another band belongs to it:
 * PDFs that place each word separately would otherwise split "15 mm" into two columns.
 */
function mergeUnitBands(cols: [number, number][], lines: Line[]): [number, number][] {
  const out: [number, number][] = [];
  for (const band of cols) {
    const prev = out[out.length - 1];
    if (prev) {
      const words = lines.flatMap((l) => l.chunks).filter((c) => Math.min(band[1], c.end) - Math.max(band[0], c.x) > 0.5);
      const h = words.length ? words.reduce((n, c) => n + c.h, 0) / words.length : 10;
      if (words.length && band[0] - prev[1] < 0.45 * h && words.filter((c) => UNIT_WORD.test(c.text)).length >= words.length * 0.8) {
        prev[1] = band[1];
        continue;
      }
    }
    out.push([band[0], band[1]]);
  }
  return out;
}

function bands(chunks: Chunk[], threshold: number): [number, number][] {
  if (!chunks.length) return [];
  const min = Math.floor(Math.min(...chunks.map((c) => c.x)));
  const max = Math.ceil(Math.max(...chunks.map((c) => c.end)));
  const size = Math.min(20_000, max - min + 2);
  const diff = new Int32Array(size + 1);
  for (const c of chunks) {
    // Whole points, after trimming a little off each end so cells that just touch stay apart.
    const inset = Math.min(0.5, (c.end - c.x) / 4);
    const a = Math.max(0, Math.floor(c.x + inset) - min);
    const b = Math.min(size, Math.max(a + 1, Math.ceil(c.end - inset) - min));
    diff[a]++;
    diff[b]--;
  }
  const out: [number, number][] = [];
  let cover = 0;
  let start = -1;
  for (let i = 0; i <= size; i++) {
    cover += diff[i] ?? 0;
    if (cover > threshold && start < 0) start = i;
    else if (cover <= threshold && start >= 0) {
      out.push([start + min, i + min]);
      start = -1;
    }
  }
  return out;
}

function bandsTouched(c: Chunk, cols: [number, number][]): number {
  return cols.filter(([a, b]) => Math.min(b, c.end) - Math.max(a, c.x) > 0.5).length;
}

function columnFor(c: Chunk, cols: [number, number][], splits: number[] = []): number {
  // Text running across a vertical border (a heading over several cells) belongs where it starts.
  const border = splits.find((x) => x > c.x + 1 && x < c.end - 1);
  let end = border ?? c.end;
  // So does text wider than one column: a heading, or a long value running into empty cells.
  const touched = cols.filter(([a, b]) => Math.min(b, end) - Math.max(a, c.x) > 0.5);
  if (touched.length > 1) end = Math.min(end, touched[0][1]);
  let best = 0;
  let bestOverlap = -Infinity;
  cols.forEach(([a, b], i) => {
    const overlap = Math.min(b, end) - Math.max(a, c.x);
    // Without any overlap, the nearest band wins (negative distance).
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = i;
    }
  });
  return best;
}

const NUMERIC = /^[₹$€£]?\s*(rs\.?|inr)?\s*[-+]?[\d,]+(\.\d+)?\s*(%|\/-)?$/i;

/** Typical distance between rows that hold numbers; null when the page doesn't show one. */
function rowPitch(lines: Line[]): number | null {
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [a, b] = [lines[i - 1], lines[i]];
    if (a.page !== b.page) continue;
    const numeric = (l: Line) => l.chunks.length >= 2 && l.chunks.some((c) => NUMERIC.test(c.text));
    if (numeric(a) && numeric(b)) gaps.push(b.y - a.y);
  }
  if (gaps.length < 3) return null;
  gaps.sort((x, y) => x - y);
  return gaps[Math.floor(gaps.length / 2)];
}

/** A short line without numbers, tucked closer under a row than rows sit apart, carries on that row's text. */
function isContinuation(line: Line, prev: { cells: string[]; line: Line }, cells: string[], pitch: number): boolean {
  if (line.page !== prev.line.page) return false;
  if (line.y - prev.line.y >= 0.75 * pitch) return false;
  if (line.chunks.some((c) => NUMERIC.test(c.text) || (/\d/.test(c.text) && c.text.length <= 6))) return false;
  return cells.every((v, i) => !v || prev.cells[i]);
}
