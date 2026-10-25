import type { PageText, Rule } from "./layout";
import { createOcr, pageFromOcr, textHeightOf, type OcrEngine, type OcrImage, type OcrPage } from "./ocr";
import { CANCELLED, raceAbort, type ReadOptions } from "./read-options";
import { evenLight, inkBox, rulesOf, skewOf, toGray, unevenLight, type Gray } from "./raster";

/**
 * Reading a scanned page: straighten it, recognise the text, and find the table's borders. All in
 * pixels of a canvas; the canvas comes from the page (browser) or from the tests.
 */
export interface CanvasCtx {
  /** drawImage(image, dx, dy[, dw, dh]) or drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh). */
  drawImage(image: unknown, ...args: number[]): void;
  getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number>; width: number; height: number };
  fillRect(x: number, y: number, w: number, h: number): void;
  createImageData(w: number, h: number): { data: { [i: number]: number; length: number } };
  putImageData(image: never, x: number, y: number): void;
  translate(x: number, y: number): void;
  rotate(radians: number): void;
  fillStyle: unknown;
  imageSmoothingQuality?: string;
}
export interface Canvas2D {
  width: number;
  height: number;
  getContext(type: "2d"): CanvasCtx | null;
  /** Node canvases (tests) can give PNG bytes; browser canvases are passed to the engine as they are. */
  toBuffer?(mime: string): Uint8Array;
}
export interface CanvasKit {
  create(width: number, height: number): Canvas2D;
  /** A photo or scan file as a canvas, turned upright by its EXIF orientation. */
  decode(bytes: Uint8Array): Promise<Canvas2D>;
}

export const browserCanvasKit: CanvasKit = {
  create(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas as unknown as Canvas2D;
  },
  async decode(bytes) {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), { imageOrientation: "from-image" });
    } catch {
      throw new Error("That picture can't be opened. Save it as a JPG or PNG (or as a PDF) and upload that.");
    }
    const canvas = browserCanvasKit.create(bitmap.width, bitmap.height);
    const ctx = ctxOf(canvas);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas;
  },
};

/** Longest side, in pixels, the engine is given: bigger pictures are reduced. */
const MAX_SIDE = 4200;
/** Height of a capital letter, in pixels, below which small print is enlarged first, and above which it is reduced (faster). */
/** Longest side of the reduced copy used to find out which way up a page is. */
const PROBE_SIDE = 1800;
const TOO_SMALL = 26;
const TOO_BIG = 70;
const TARGET = 32;
/** Lighting this uneven (share of the paper's brightness) is evened out first. */
const UNEVEN = 0.07;
/** Height, in pixels, a number is enlarged to when it is read again on its own. */
const NUMBER_HEIGHT = 56;

function ctxOf(canvas: Canvas2D): CanvasCtx {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't process pictures.");
  return ctx;
}

function grayOf(canvas: Canvas2D): Gray {
  return toGray(ctxOf(canvas).getImageData(0, 0, canvas.width, canvas.height));
}

/** The picture with shadows and uneven light taken out, when it has them (a photo, not a flat scan). */
function evened(src: Canvas2D, kit: CanvasKit): Canvas2D {
  const gray = grayOf(src);
  if (unevenLight(gray) < UNEVEN) return src;
  const flat = evenLight(gray);
  const out = kit.create(src.width, src.height);
  const ctx = ctxOf(out);
  const image = ctx.createImageData(out.width, out.height);
  for (let i = 0, p = 0; i < flat.data.length; i++, p += 4) {
    image.data[p] = image.data[p + 1] = image.data[p + 2] = flat.data[i];
    image.data[p + 3] = 255;
  }
  ctx.putImageData(image as never, 0, 0);
  return out;
}

function resized(src: Canvas2D, factor: number, kit: CanvasKit): Canvas2D {
  const out = kit.create(Math.max(1, Math.round(src.width * factor)), Math.max(1, Math.round(src.height * factor)));
  const ctx = ctxOf(out);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

function turned(src: Canvas2D, radians: number, kit: CanvasKit): Canvas2D {
  const out = kit.create(src.width, src.height);
  const ctx = ctxOf(out);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(radians);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

const imageOf = (canvas: Canvas2D): OcrImage => (typeof canvas.toBuffer === "function" ? canvas.toBuffer("image/png") : (canvas as unknown as HTMLCanvasElement));

/** A copy with the table's lines painted out: lines through a picture of text make the engine drop or garble the words beside them. */
function withoutRules(src: Canvas2D, rules: Rule[], kit: CanvasKit): Canvas2D {
  const out = kit.create(src.width, src.height);
  const ctx = ctxOf(out);
  ctx.drawImage(src, 0, 0);
  ctx.fillStyle = "#fff";
  for (const r of rules) {
    const grow = (r.width ?? 2) / 2 + 2;
    if (r.y0 === r.y1) ctx.fillRect(r.x0 - 2, r.y0 - grow, r.x1 - r.x0 + 4, grow * 2);
    else ctx.fillRect(r.x0 - grow, r.y0 - 2, grow * 2, r.y1 - r.y0 + 4);
  }
  return out;
}

/** What is learned from the pages of one file, for the pages after them. */
export interface ScanSession {
  /** Quarter turns (clockwise) pages needed to read upright. */
  quarters: number;
}

/** A word that is only digits and number punctuation, two characters or more: a price, a quantity, a percentage. */
const NUMBER = /^[\d.,%]{2,}$/;

/**
 * Whether the second reading of a number should replace the first. A lost decimal point is the usual
 * slip, a made-up one is rare: when both have the same digits the one with more points wins; when
 * the digits differ the second wins unless the engine is clearly less sure of it.
 */
export function betterNumber(first: string, firstConfidence: number, second: string, secondConfidence: number): boolean {
  if (second === first) return false;
  const digits = (t: string) => t.replace(/\D/g, "");
  const points = (t: string) => t.replace(/[^.,]/g, "").length;
  if (digits(first) === digits(second)) return points(second) > points(first);
  return secondConfidence >= firstConfidence - 5;
}

/**
 * Numbers are what matters most and what the engine slips on most (a decimal point lost between two
 * digits turns 24.3 into 243), so each one is read again on its own: cut out, enlarged and limited
 * to digits. The second reading replaces the first when it is a number too and the engine is not
 * clearly less sure of it.
 */
async function rereadNumbers(page: OcrPage, canvas: Canvas2D, engine: OcrEngine, kit: CanvasKit): Promise<OcrPage> {
  const lines = [];
  for (const line of page.lines) {
    const words = [];
    for (const w of line.words) {
      const text = w.text.trim();
      const height = w.bbox.y1 - w.bbox.y0;
      if (!NUMBER.test(text) || height < 6) {
        words.push(w);
        continue;
      }
      const padX = Math.round(height * 0.4);
      const padY = Math.round(height * 0.3);
      const x0 = Math.max(0, w.bbox.x0 - padX);
      const y0 = Math.max(0, w.bbox.y0 - padY);
      const sw = Math.min(canvas.width, w.bbox.x1 + padX) - x0;
      const sh = Math.min(canvas.height, w.bbox.y1 + padY) - y0;
      const zoom = Math.min(4, Math.max(1, NUMBER_HEIGHT / height));
      const crop = kit.create(Math.max(8, Math.round(sw * zoom)), Math.max(8, Math.round(sh * zoom)));
      const ctx = ctxOf(crop);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, crop.width, crop.height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(canvas, x0, y0, sw, sh, 0, 0, crop.width, crop.height);
      const again = await engine.recognizeNumber(imageOf(crop));
      words.push(again && NUMBER.test(again.text) && betterNumber(text, w.confidence, again.text, again.confidence) ? { ...w, text: again.text, confidence: again.confidence } : w);
    }
    lines.push({ ...line, words });
  }
  return { ...page, lines };
}

export interface ScanResult {
  page: PageText;
  /** Mean confidence of the recognised words, 0–100. */
  confidence: number;
}

/** Straightens a crooked page. */
function straightened(canvas: Canvas2D, kit: CanvasKit): Canvas2D {
  const angle = skewOf(grayOf(canvas));
  return angle ? turned(canvas, -angle, kit) : canvas;
}

/** The page turned by whole quarter turns, clockwise. */
function quarterTurned(src: Canvas2D, quarters: number, kit: CanvasKit): Canvas2D {
  const sideways = quarters % 2 === 1;
  const out = kit.create(sideways ? src.height : src.width, sideways ? src.width : src.height);
  const ctx = ctxOf(out);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((quarters * Math.PI) / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

/** How much good text was read: letters in words the engine is sure of. */
const goodText = (ocr: OcrPage) => ocr.lines.reduce((n, l) => n + l.words.reduce((m, w) => m + (w.confidence >= 60 ? w.text.length : 0), 0), 0);

/**
 * A page scanned sideways or upside down reads as nonsense. Tries the four ways up on a reduced copy
 * and returns how many quarter turns (clockwise) make it read best, 0 when it already does.
 */
async function turnsNeeded(work: Canvas2D, engine: OcrEngine, kit: CanvasKit): Promise<number> {
  // Only the inked part of the page, so that a small table on a big sheet keeps its text size.
  const [x0, y0, x1, y1] = inkBox(grayOf(work));
  const cropped = kit.create(x1 - x0, y1 - y0);
  const cropCtx = ctxOf(cropped);
  cropCtx.fillStyle = "#fff";
  cropCtx.fillRect(0, 0, cropped.width, cropped.height);
  cropCtx.drawImage(work, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
  const big = Math.max(cropped.width, cropped.height);
  // Reduced if large; enlarged if small, since small print is what the engine reads worst.
  const probeFactor = Math.min(2.5, PROBE_SIDE / big);
  const probe = Math.abs(probeFactor - 1) > 0.1 ? resized(cropped, probeFactor, kit) : cropped;
  const scores: number[] = [];
  for (let q = 0; q < 4; q++) scores.push(goodText(await engine.recognize(imageOf(q ? quarterTurned(probe, q, kit) : probe))));
  const best = scores.indexOf(Math.max(...scores));
  return best !== 0 && scores[best] >= 25 && scores[best] > 1.5 * scores[0] ? best : 0;
}

/**
 * @param canvas the page picture; left unchanged.
 * @param pixelsPerUnit for a page drawn from a PDF: pixels of `canvas` to a point, so the page's text
 *   comes out in points like the text of other PDFs and all pages share one scale. For a lone picture
 *   (omitted) the scale is taken from the size of its text.
 */
export async function readScan(canvas: Canvas2D, engine: OcrEngine, kit: CanvasKit, session: ScanSession = { quarters: 0 }, pixelsPerUnit?: number): Promise<ScanResult> {
  let work = canvas;
  // How much `work` has been enlarged or reduced from `canvas`.
  let zoom = 1;
  const big = Math.max(work.width, work.height);
  if (big > MAX_SIDE) {
    zoom = MAX_SIDE / big;
    work = resized(work, zoom, kit);
  }
  work = evened(work, kit);
  // The pages of one file are mostly turned the same way: start with the way the last page needed.
  if (session.quarters) work = quarterTurned(work, session.quarters, kit);
  // Crooked scans are straightened first: lines of text read better, and table borders can be found.
  work = straightened(work, kit);

  // A page is about 100 text heights wide until the text has been measured.
  let text = work.width / 100;
  let checkedTurn = false;
  let checkedSize = false;
  for (;;) {
    const rules = rulesOf(grayOf(work), text);
    const ocr = await engine.recognize(imageOf(rules.length ? withoutRules(work, rules, kit) : work));
    const height = textHeightOf(ocr);
    if (!checkedTurn && ocr.confidence < 65) {
      checkedTurn = true;
      const quarters = await turnsNeeded(work, engine, kit);
      if (quarters) {
        work = straightened(quarterTurned(work, quarters, kit), kit);
        session.quarters = (session.quarters + quarters) % 4;
        text = work.width / 100;
        continue;
      }
    }
    // Small print is enlarged, large print reduced, to the size the engine reads best.
    if (!checkedSize && height > 0 && (height < TOO_SMALL || height > TOO_BIG)) {
      checkedSize = true;
      const factor = Math.min(3, TARGET / height, MAX_SIDE / Math.max(work.width, work.height));
      if (Math.abs(factor - 1) > 0.15) {
        work = resized(work, factor, kit);
        zoom *= factor;
        text = height * factor;
        continue;
      }
    }
    const clean = rules.length ? withoutRules(work, rules, kit) : work;
    const read = await rereadNumbers(ocr, clean, engine, kit);
    return { page: pageFromOcr(read, rules, pixelsPerUnit ? 1 / (pixelsPerUnit * zoom) : undefined), confidence: ocr.confidence };
  }
}

/** The recognition engine, started when the first scanned page needs it and stopped when the file has been read. */
export function lazyOcr(opts: ReadOptions) {
  let engine: Promise<OcrEngine> | null = null;
  const stop = async () => {
    if (!engine) return;
    const e = engine;
    engine = null;
    try {
      await (await e).close();
    } catch {
      // Already stopped.
    }
  };
  opts.signal?.addEventListener("abort", () => void stop(), { once: true });
  return {
    async get(): Promise<OcrEngine> {
      if (opts.signal?.aborted) throw new Error(CANCELLED);
      engine ??= createOcr({
        ...opts.ocr,
        onStatus: (status, progress) => {
          if (/loading|initializing/i.test(status)) opts.onProgress?.({ stage: "engine", progress });
        },
      });
      const ready = await raceAbort(opts.signal, engine);
      // Calls stop at once on cancel, whatever the stopped worker does.
      return {
        recognize: (image) => raceAbort(opts.signal, ready.recognize(image)),
        recognizeNumber: (image) => raceAbort(opts.signal, ready.recognizeNumber(image)),
        close: ready.close,
      };
    },
    close: stop,
  };
}

/** Moves the page sideways, for lining up the pages of a scanned document. */
export function shifted(page: PageText, dx: number): PageText {
  if (!dx) return page;
  return {
    pieces: page.pieces.map((p) => ({ ...p, x: p.x + dx })),
    rules: page.rules?.map((r) => ({ ...r, x0: r.x0 + dx, x1: r.x1 + dx })),
  };
}

/** Where a scanned page's table starts on the left: its first vertical border, or else the left edge of its text. */
export function leftEdge(page: PageText): number {
  const borders = (page.rules ?? []).filter((r) => r.x0 === r.x1).map((r) => r.x0);
  if (borders.length >= 2) return Math.min(...borders);
  return page.pieces.length ? Math.min(...page.pieces.map((p) => p.x)) : 0;
}
