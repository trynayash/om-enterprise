import type { Rule, TextPiece } from "./layout";

/**
 * Text runs from a pdf.js operator list, with the position of each text-drawing operation.
 * pdf.js's own text extraction joins runs that sit close together on a line, which glues the cells
 * of a price list into one string ("1 TL-011", "6.12 18%"); programs that make PDFs from
 * spreadsheets and billing software draw every cell with its own operation, so the operations are
 * the cells. The text state is followed the way pdf.js's canvas renderer follows it. Straight
 * lines and thin bars drawn on the page are collected too: they are the borders of tables.
 */
export type Matrix = [number, number, number, number, number, number];

export interface GlyphLike {
  unicode?: string;
  width?: number;
  isSpace?: boolean;
  vmetric?: number[] | null;
}

export interface FontInfo {
  fontMatrix?: ArrayLike<number> | null;
  vertical?: boolean;
}

/** The numbers of the operators this reader follows (pdf.js's OPS). */
export interface OpCodes {
  save: number;
  restore: number;
  transform: number;
  beginText: number;
  setCharSpacing: number;
  setWordSpacing: number;
  setHScale: number;
  setLeading: number;
  setFont: number;
  setTextRise: number;
  moveText: number;
  setLeadingMoveText: number;
  setTextMatrix: number;
  nextLine: number;
  showText: number;
  showSpacedText: number;
  nextLineShowText: number;
  nextLineSetSpacingShowText: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  beginGroup: number;
  endGroup: number;
  clip: number;
  eoClip: number;
  constructPath: number;
  stroke: number;
  closeStroke: number;
  fill: number;
  eoFill: number;
  fillStroke: number;
  eoFillStroke: number;
  closeFillStroke: number;
  closeEOFillStroke: number;
}

/** The operators that draw a picture (pdf.js's OPS), for judging whether a page is a scan. */
export interface PictureOpCodes {
  save: number;
  restore: number;
  transform: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  beginGroup: number;
  endGroup: number;
  paintImageXObject: number;
  paintInlineImageXObject: number;
  paintImageMaskXObject: number;
  paintImageXObjectRepeat: number;
  paintInlineImageXObjectGroup: number;
  paintImageMaskXObjectGroup: number;
}

/** A clipping region on the page: left, top, right, bottom. */
type Box = [number, number, number, number];

interface State {
  ctm: Matrix;
  tm: Matrix;
  x: number;
  y: number;
  lineX: number;
  lineY: number;
  font: FontInfo | undefined;
  fontSize: number;
  dir: number;
  charSpacing: number;
  wordSpacing: number;
  hScale: number;
  leading: number;
  rise: number;
  clip: Box | null;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m1: ArrayLike<number>, m2: ArrayLike<number>): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Within one operation, two or more spaces or a jump this wide (in ems) starts a new run. */
const SPLIT_GAP = 0.5;
/** A jump this wide (in ems) without a space glyph is a space between words. */
const WORD_GAP = 0.15;

/**
 * @param viewport pdf.js viewport transform: page space → top-left origin, including page rotation.
 * @param fontFor font metrics by the name used in setFont.
 */
export function piecesFromOperators(
  fnArray: ArrayLike<number>,
  argsArray: ArrayLike<unknown>,
  ops: OpCodes,
  viewport: ArrayLike<number>,
  fontFor: (name: string) => FontInfo | undefined,
  normalize: (s: string) => string = (s) => s,
): { pieces: TextPiece[]; rules: Rule[]; sideways: number } {
  const pieces: TextPiece[] = [];
  const counts = { sideways: 0 };
  const rules: Rule[] = [];
  const stroked = new Set([ops.stroke, ops.closeStroke, ops.fillStroke, ops.eoFillStroke, ops.closeFillStroke, ops.closeEOFillStroke]);
  const filled = new Set([ops.fill, ops.eoFill, ops.fillStroke, ops.eoFillStroke, ops.closeFillStroke, ops.closeEOFillStroke]);
  const stack: State[] = [];
  let st: State = {
    ctm: [...(viewport as number[])].slice(0, 6) as Matrix,
    tm: IDENTITY,
    x: 0,
    y: 0,
    lineX: 0,
    lineY: 0,
    font: undefined,
    fontSize: 0,
    dir: 1,
    charSpacing: 0,
    wordSpacing: 0,
    hScale: 1,
    leading: 0,
    rise: 0,
    clip: null,
  };
  let pendingClip = false;
  const moveText = (x: number, y: number) => {
    st.x = st.lineX += x;
    st.y = st.lineY += y;
  };

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = (argsArray[i] ?? []) as unknown[];
    switch (fn) {
      case ops.save:
      case ops.beginGroup:
        stack.push({ ...st });
        break;
      case ops.restore:
      case ops.endGroup:
      case ops.paintFormXObjectEnd:
        st = stack.pop() ?? st;
        break;
      case ops.paintFormXObjectBegin:
        stack.push({ ...st });
        if (isMatrix(args[0])) st.ctm = multiply(st.ctm, args[0]);
        break;
      case ops.clip:
      case ops.eoClip:
        pendingClip = true;
        break;
      case ops.constructPath:
        // Text cut off at a cell's edge (spreadsheet exports do this to long headings) only covers
        // the visible part of the page, which keeps it out of the next column.
        if (pendingClip && isBox(args[2])) st.clip = intersect(st.clip, boxOf(st.ctm, args[2]));
        pendingClip = false;
        if (stroked.has(Number(args[0])) || filled.has(Number(args[0]))) {
          rulesOfPath(st.ctm, (args[1] as unknown[] | undefined)?.[0], stroked.has(Number(args[0])), filled.has(Number(args[0])), rules);
        }
        break;
      case ops.transform:
        if (args.length >= 6) st.ctm = multiply(st.ctm, args as number[]);
        break;
      case ops.beginText:
        st.tm = IDENTITY;
        st.x = st.lineX = st.y = st.lineY = 0;
        break;
      case ops.setTextMatrix: {
        const m = isMatrix(args[0]) ? args[0] : args;
        if (isMatrix(m)) {
          st.tm = Array.from(m).slice(0, 6) as Matrix;
          st.x = st.lineX = st.y = st.lineY = 0;
        }
        break;
      }
      case ops.moveText:
        moveText(Number(args[0]) || 0, Number(args[1]) || 0);
        break;
      case ops.setLeadingMoveText:
        st.leading = Number(args[1]) || 0;
        moveText(Number(args[0]) || 0, Number(args[1]) || 0);
        break;
      case ops.nextLine:
        moveText(0, st.leading);
        break;
      case ops.setLeading:
        st.leading = -(Number(args[0]) || 0);
        break;
      case ops.setCharSpacing:
        st.charSpacing = Number(args[0]) || 0;
        break;
      case ops.setWordSpacing:
        st.wordSpacing = Number(args[0]) || 0;
        break;
      case ops.setHScale:
        st.hScale = (Number(args[0]) || 100) / 100;
        break;
      case ops.setTextRise:
        st.rise = Number(args[0]) || 0;
        break;
      case ops.setFont: {
        const size = Number(args[1]) || 0;
        st.font = fontFor(String(args[0]));
        st.fontSize = Math.abs(size);
        st.dir = size < 0 ? -1 : 1;
        break;
      }
      case ops.nextLineShowText:
      case ops.nextLineSetSpacingShowText:
      case ops.showSpacedText:
      case ops.showText:
        // pdf.js turns ', " and TJ into nextLine / spacing / showText; the others are kept for safety.
        if (fn === ops.nextLineSetSpacingShowText) {
          st.wordSpacing = Number(args[0]) || 0;
          st.charSpacing = Number(args[1]) || 0;
        }
        if (fn === ops.nextLineShowText || fn === ops.nextLineSetSpacingShowText) moveText(0, st.leading);
        showText(st, args[args.length - 1], pieces, normalize, counts);
        break;
    }
  }
  return { pieces, rules, sideways: counts.sideways };
}

/**
 * Table borders in a drawn path: straight horizontal or vertical strokes, thin filled bars, and the
 * edges of filled rectangles (shaded cells and rows). Path data is pdf.js's: an op code (move, line,
 * curve, quadratic curve, close) followed by its points.
 */
function rulesOfPath(m: Matrix, data: unknown, stroke: boolean, fill: boolean, out: Rule[]) {
  if (!data || typeof data !== "object" || typeof (data as ArrayLike<number>).length !== "number") return;
  const d = data as ArrayLike<number>;
  const shapes: { pts: [number, number][]; curved: boolean }[] = [];
  const segments: [[number, number], [number, number]][] = [];
  let cur: { pts: [number, number][]; curved: boolean } | undefined;
  for (let i = 0; i < d.length && out.length < 20_000; ) {
    const op = d[i++];
    if (op === 0) {
      cur = { pts: [apply(m, d[i], d[i + 1])], curved: false };
      shapes.push(cur);
      i += 2;
    } else if (op === 1) {
      const p = apply(m, d[i], d[i + 1]);
      if (cur) {
        segments.push([cur.pts[cur.pts.length - 1], p]);
        cur.pts.push(p);
      }
      i += 2;
    } else if (op === 2 || op === 3) {
      const n = op === 2 ? 6 : 4;
      if (cur) {
        cur.curved = true;
        cur.pts.push(apply(m, d[i + n - 2], d[i + n - 1]));
      }
      i += n;
    } else if (op === 4) {
      if (cur && cur.pts.length > 2) segments.push([cur.pts[cur.pts.length - 1], cur.pts[0]]);
    } else return;
  }
  if (stroke) {
    for (const [[x0, y0], [x1, y1]] of segments) {
      if ((Math.abs(y1 - y0) <= 1 && Math.abs(x1 - x0) >= 2) || (Math.abs(x1 - x0) <= 1 && Math.abs(y1 - y0) >= 2)) out.push({ x0, y0, x1, y1 });
    }
  }
  if (fill) {
    for (const s of shapes) {
      if (s.curved || s.pts.length < 3) continue;
      const xs = s.pts.map((p) => p[0]);
      const ys = s.pts.map((p) => p[1]);
      const [l, t, r, b] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      if (b - t <= 3 && r - l >= 2) out.push({ x0: l, y0: (t + b) / 2, x1: r, y1: (t + b) / 2 });
      else if (r - l <= 3 && b - t >= 2) out.push({ x0: (l + r) / 2, y0: t, x1: (l + r) / 2, y1: b });
      else if (s.pts.every(([x, y]) => (Math.abs(x - l) < 0.5 || Math.abs(x - r) < 0.5) && (Math.abs(y - t) < 0.5 || Math.abs(y - b) < 0.5))) {
        out.push({ x0: l, y0: t, x1: r, y1: t }, { x0: l, y0: b, x1: r, y1: b }, { x0: l, y0: t, x1: l, y1: b }, { x0: r, y0: t, x1: r, y1: b });
      }
    }
  }
}

function isBox(v: unknown): v is ArrayLike<number> {
  return !!v && typeof v === "object" && (v as ArrayLike<number>).length === 4 && Array.from(v as ArrayLike<number>).every(Number.isFinite);
}

/** Page box of a box given in the space of `m`. */
function boxOf(m: Matrix, b: ArrayLike<number>): Box {
  const pts = [apply(m, b[0], b[1]), apply(m, b[2], b[1]), apply(m, b[0], b[3]), apply(m, b[2], b[3])];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function intersect(a: Box | null, b: Box): Box {
  if (!a) return b;
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
}

function isMatrix(v: unknown): v is ArrayLike<number> {
  return !!v && typeof v === "object" && typeof (v as ArrayLike<number>).length === "number" && (v as ArrayLike<number>).length >= 6;
}

function showText(st: State, glyphs: unknown, out: TextPiece[], normalize: (s: string) => string, counts: { sideways: number }) {
  if (!Array.isArray(glyphs) || !st.fontSize) return;
  const size = st.fontSize;
  const fm = st.font?.fontMatrix ?? [0.001, 0, 0, 0.001, 0, 0];
  const scale = size * (fm[0] || 0.001);
  const hs = st.hScale * st.dir;

  if (st.font?.vertical) {
    // Vertical writing: keep the text state right but leave the text out (it is not a table row).
    let y = 0;
    for (const g of glyphs) {
      if (typeof g === "number") y += (g * size) / 1000;
      else if (g && typeof g === "object") {
        const glyph = g as GlyphLike;
        const spacing = (glyph.isSpace ? st.wordSpacing : 0) + st.charSpacing;
        y += -(glyph.vmetric?.[0] ?? glyph.width ?? 0) * scale - spacing * st.dir;
      }
    }
    st.y -= y;
    return;
  }

  // Page position of a point on the baseline, `x` text-space units along the run.
  const at = multiply(multiply(st.ctm, st.tm), [1, 0, 0, 1, st.x, st.y + st.rise]);
  const height = size * Math.hypot(at[2], at[3]);
  // Only text that reads left to right across the page; sideways and upside-down runs are counted.
  const rotated = Math.abs(at[1]) > Math.abs(at[0]) || at[0] < 0;
  if (rotated) counts.sideways++;

  let x = 0;
  let piece: { start: number; end: number; text: string } | null = null;
  let spaces = 0;
  let spaceWidth = 0;
  const flush = () => {
    if (piece && !rotated) {
      const [ax, y] = apply(at, piece.start * hs, 0);
      const [bx] = apply(at, piece.end * hs, 0);
      let [x0, x1] = [Math.min(ax, bx), Math.max(ax, bx)];
      const str = normalize(piece.text);
      const c = st.clip;
      const visible = !c || (y - 0.3 * height >= c[1] - 1 && y - 0.3 * height <= c[3] + 1 && x1 > c[0] && x0 < c[2]);
      const cut = !!c && x1 > c[2];
      if (c) [x0, x1] = [Math.max(x0, c[0]), Math.min(x1, c[2])];
      if (visible && str.trim()) out.push({ x: x0, y, w: x1 - x0, h: height, str, ...(cut ? { cut } : {}) });
    }
    piece = null;
  };

  for (const g of glyphs) {
    if (typeof g === "number") {
      x += (-g * size) / 1000;
      continue;
    }
    if (!g || typeof g !== "object") continue;
    const glyph = g as GlyphLike;
    const spacing = (glyph.isSpace ? st.wordSpacing : 0) + st.charSpacing;
    const advance = (Number(glyph.width) || 0) * scale + spacing * st.dir;
    const text = glyph.unicode ?? "";
    // isSpace is about character code 32, which word spacing applies to; subset fonts can give that code any letter.
    if (!text.trim()) {
      spaces++;
      spaceWidth += advance;
      x += advance;
      continue;
    }
    if (piece) {
      const extra = x - piece.end - spaceWidth;
      if (spaces >= 2 || extra > SPLIT_GAP * size) flush();
      else if (spaces || extra > WORD_GAP * size) piece.text += " ";
    }
    if (piece) {
      piece.text += text;
      piece.end = x + advance;
    } else piece = { start: x, end: x + advance, text };
    spaces = 0;
    spaceWidth = 0;
    x += advance;
  }
  flush();
  st.x += x * hs;
}

/**
 * How much of the page the biggest picture on it covers, 0–1: a scanned page is one picture of
 * about the whole page, a photo catalogue's page has pictures that leave room for text.
 * @param viewport pdf.js viewport transform; `width` and `height` are the page's size in the same units.
 */
export function pictureCoverage(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>, ops: PictureOpCodes, viewport: ArrayLike<number>, width: number, height: number): number {
  const stack: Matrix[] = [];
  let ctm: Matrix = [...(viewport as number[])].slice(0, 6) as Matrix;
  let best = 0;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = (argsArray[i] ?? []) as unknown[];
    if (fn === ops.save || fn === ops.beginGroup) stack.push(ctm);
    else if (fn === ops.restore || fn === ops.endGroup || fn === ops.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === ops.paintFormXObjectBegin) {
      stack.push(ctm);
      if (isMatrix(args[0])) ctm = multiply(ctm, args[0]);
    } else if (fn === ops.transform && args.length >= 6) ctm = multiply(ctm, args as number[]);
    else if (fn === ops.paintImageXObject || fn === ops.paintInlineImageXObject || fn === ops.paintImageMaskXObject) {
      // An image fills the unit square of the current space.
      best = Math.max(best, Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]) / Math.max(1, width * height));
    } else if (fn === ops.paintImageXObjectRepeat || fn === ops.paintInlineImageXObjectGroup || fn === ops.paintImageMaskXObjectGroup) {
      // Many small pictures (or tiles) with their own placement: not measured, assume a full page.
      best = 1;
    }
  }
  return Math.min(1, best);
}
