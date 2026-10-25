import type { Rule } from "./layout";

/**
 * Looking at a scanned page as pixels: how crooked it was fed in, and where the lines of its table
 * are. Pure functions on a grey image (one byte per pixel), so they run the same in the browser and
 * in tests.
 */
export interface Gray {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

/** RGBA pixels (canvas ImageData) to grey. */
export function toGray(rgba: { data: ArrayLike<number>; width: number; height: number }): Gray {
  const { data, width, height } = rgba;
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  return { data: out, width, height };
}

/** The grey level that separates ink from paper: a good way below the paper's own level, which varies in photos. */
export function inkLevel(g: Gray): number {
  const hist = new Uint32Array(256);
  const step = Math.max(1, Math.floor(g.data.length / 400_000));
  for (let i = 0; i < g.data.length; i += step) hist[g.data[i]]++;
  // Paper: the level most pixels have among the lighter half.
  let paper = 255;
  let best = 0;
  for (let v = 128; v < 256; v++) {
    if (hist[v] > best) {
      best = hist[v];
      paper = v;
    }
  }
  const level = paper - 50;
  return level >= 80 ? level : 128;
}

/** The smallest box holding the page's ink (left, top, right, bottom), ignoring stray specks; the whole page when it has none. */
export function inkBox(g: Gray): [number, number, number, number] {
  const level = inkLevel(g);
  const rows = new Uint32Array(g.height);
  const cols = new Uint32Array(g.width);
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      if (g.data[y * g.width + x] < level) {
        rows[y]++;
        cols[x]++;
      }
    }
  }
  const first = (a: Uint32Array) => a.findIndex((v) => v >= 3);
  const last = (a: Uint32Array) => {
    for (let i = a.length - 1; i >= 0; i--) if (a[i] >= 3) return i;
    return -1;
  };
  const [x0, x1, y0, y1] = [first(cols), last(cols), first(rows), last(rows)];
  return x0 < 0 || y0 < 0 ? [0, 0, g.width, g.height] : [x0, y0, x1 + 1, y1 + 1];
}

/**
 * The angle (radians, positive = clockwise) the text lines are tilted by, found where the rows of ink
 * pile up the sharpest when the page is sheared back; 0 when the page is straight or no angle is
 * clearly best.
 */
export function skewOf(g: Gray): number {
  const level = inkLevel(g);
  // Ink pixels of a reduced copy of the page, as coordinates.
  const f = Math.max(1, Math.round(Math.max(g.width, g.height) / 1100));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y + f <= g.height; y += f) {
    for (let x = 0; x + f <= g.width; x += f) {
      let dark = 0;
      for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) if (g.data[(y + dy) * g.width + x + dx] < level) dark++;
      if (dark * 3 >= f * f) {
        xs.push(x / f);
        ys.push(y / f);
      }
    }
  }
  if (xs.length < 200) return 0;
  const h = Math.ceil(g.height / f) + Math.ceil(g.width / f) + 8;
  const bins = new Float64Array(h);
  const sharpness = (a: number) => {
    bins.fill(0);
    const t = Math.tan(a);
    const shift = Math.ceil(g.width / f) * Math.abs(t) + 2;
    for (let i = 0; i < xs.length; i++) bins[Math.round(ys[i] - xs[i] * t + shift)]++;
    let s = 0;
    for (let i = 0; i < h; i++) s += bins[i] * bins[i];
    return s;
  };
  let best = 0;
  let bestScore = sharpness(0);
  const flat = bestScore;
  for (let deg = -4; deg <= 4; deg += 0.25) {
    const s = sharpness((deg * Math.PI) / 180);
    if (s > bestScore) {
      bestScore = s;
      best = (deg * Math.PI) / 180;
    }
  }
  for (let deg = -0.25; deg <= 0.25; deg += 0.05) {
    const a = best + (deg * Math.PI) / 180;
    const s = sharpness(a);
    if (s > bestScore) {
      bestScore = s;
      best = a;
    }
  }
  // Not worth turning the page for less than a tenth of a degree, or for no clear gain.
  return Math.abs(best) < (0.1 * Math.PI) / 180 || bestScore < flat * 1.02 ? 0 : best;
}

/**
 * Straight lines in the page — the borders of a table — as rules in pixels. A line must be long
 * (a table's edge, not an underline or a letter) and may have small breaks where the scan or the
 * printer dropped it. `text` is the height of a line of text in pixels.
 */
export function rulesOf(g: Gray, text: number): Rule[] {
  const level = inkLevel(g);
  const { width: W, height: H } = g;
  const rules: Rule[] = [];
  const gap = Math.max(2, Math.round(text * 0.2));

  // Horizontal: runs of ink along each row.
  const hMin = Math.max(10 * text, 0.18 * W);
  const rows: { y: number; x0: number; x1: number }[] = [];
  for (let y = 0; y < H; y++) {
    let start = -1;
    let last = -1;
    const base = y * W;
    for (let x = 0; x <= W; x++) {
      const ink = x < W && g.data[base + x] < level;
      if (ink) {
        if (start < 0) start = x;
        last = x;
      } else if (start >= 0 && (x >= W || x - last > gap)) {
        if (last - start + 1 >= hMin) rows.push({ y, x0: start, x1: last });
        start = -1;
      }
    }
  }
  rules.push(
    ...mergeRows(rows, (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) >= 0.8 * Math.min(a.x1 - a.x0, b.x1 - b.x0)).map((r) => ({
      x0: r.min0,
      y0: r.mid,
      x1: r.max1,
      y1: r.mid,
      width: r.last - r.first + 1,
    })),
  );

  // Vertical: the same down each column.
  const vMin = Math.max(5 * text, 0.04 * H);
  const cols: { y: number; x0: number; x1: number }[] = [];
  for (let x = 0; x < W; x++) {
    let start = -1;
    let last = -1;
    for (let y = 0; y <= H; y++) {
      const ink = y < H && g.data[y * W + x] < level;
      if (ink) {
        if (start < 0) start = y;
        last = y;
      } else if (start >= 0 && (y >= H || y - last > gap)) {
        if (last - start + 1 >= vMin) cols.push({ y: x, x0: start, x1: last });
        start = -1;
      }
    }
  }
  rules.push(
    ...mergeRows(cols, (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) >= 0.8 * Math.min(a.x1 - a.x0, b.x1 - b.x0)).map((r) => ({
      x0: r.mid,
      y0: r.min0,
      x1: r.mid,
      y1: r.max1,
      width: r.last - r.first + 1,
    })),
  );
  return rules.length > 4000 ? [] : rules;
}

/** Neighbouring scan lines that continue each other are one line, as thick as the stroke is. */
function mergeRows(items: { y: number; x0: number; x1: number }[], continues: (a: { x0: number; x1: number }, b: { x0: number; x1: number }) => boolean) {
  const out: { first: number; last: number; min0: number; max1: number; mid: number; x0: number; x1: number }[] = [];
  let open: typeof out = [];
  for (const it of items) {
    // Only lines that touched the row before this one can go on.
    open = open.filter((o) => o.last >= it.y - 1);
    const hit = open.find((o) => o.last === it.y - 1 && continues(o, it));
    if (hit) {
      hit.last = it.y;
      hit.min0 = Math.min(hit.min0, it.x0);
      hit.max1 = Math.max(hit.max1, it.x1);
      hit.x0 = it.x0;
      hit.x1 = it.x1;
    } else {
      const o = { first: it.y, last: it.y, min0: it.x0, max1: it.x1, mid: it.y, x0: it.x0, x1: it.x1 };
      open.push(o);
      out.push(o);
    }
  }
  const thick = out.filter((o) => o.last - o.first + 1 <= 12);
  for (const o of thick) o.mid = (o.first + o.last) / 2;
  return thick;
}

/**
 * How uneven the lighting of the page is, 0–1: the spread of the paper's brightness across the
 * page (shadows, a window's glare, the dark corners of a phone photo). A flat scan is near 0.
 */
export function unevenLight(g: Gray): number {
  const grid = paperLevels(g);
  const all = grid.levels.slice().sort((a, b) => a - b);
  const lo = all[Math.floor(all.length * 0.1)];
  const hi = all[Math.floor(all.length * 0.9)];
  return hi > 0 ? (hi - lo) / hi : 0;
}

/** Brightness of the paper by block: the light end of each block's pixels, taken over the block and its neighbours so that dark ink never reads as dark paper. */
function paperLevels(g: Gray) {
  const block = Math.max(32, Math.round(Math.min(g.width, g.height) / 24));
  const cols = Math.ceil(g.width / block);
  const rows = Math.ceil(g.height / block);
  const raw = new Float64Array(cols * rows);
  const hist = new Uint32Array(256);
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      hist.fill(0);
      let n = 0;
      for (let y = by * block; y < Math.min(g.height, (by + 1) * block); y += 2) {
        for (let x = bx * block; x < Math.min(g.width, (bx + 1) * block); x += 2) {
          hist[g.data[y * g.width + x]]++;
          n++;
        }
      }
      let acc = 0;
      let v = 255;
      for (; v > 0; v--) {
        acc += hist[v];
        if (acc >= n * 0.12) break;
      }
      raw[by * cols + bx] = v;
    }
  }
  const levels = new Float64Array(cols * rows);
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      let best = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) best = Math.max(best, raw[Math.min(rows - 1, Math.max(0, by + dy)) * cols + Math.min(cols - 1, Math.max(0, bx + dx))]);
      levels[by * cols + bx] = best;
    }
  }
  return { levels: Array.from(levels), cols, rows, block };
}

/** The page with its paper brought to an even light grey: shadows and vignetting removed, ink kept dark. */
export function evenLight(g: Gray): Gray {
  const { levels, cols, rows, block } = paperLevels(g);
  const out = new Uint8Array(g.width * g.height);
  const at = (bx: number, by: number) => levels[Math.min(rows - 1, Math.max(0, by)) * cols + Math.min(cols - 1, Math.max(0, bx))];
  for (let y = 0; y < g.height; y++) {
    const fy = y / block - 0.5;
    const by = Math.floor(fy);
    const ty = fy - by;
    for (let x = 0; x < g.width; x++) {
      const fx = x / block - 0.5;
      const bx = Math.floor(fx);
      const tx = fx - bx;
      const paper = (at(bx, by) * (1 - tx) + at(bx + 1, by) * tx) * (1 - ty) + (at(bx, by + 1) * (1 - tx) + at(bx + 1, by + 1) * tx) * ty;
      out[y * g.width + x] = Math.min(255, Math.round((g.data[y * g.width + x] * 245) / Math.max(90, paper)));
    }
  }
  return { data: out, width: g.width, height: g.height };
}
