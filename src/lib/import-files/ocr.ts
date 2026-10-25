import type { PageText, Rule, TextPiece } from "./layout";

/**
 * Text recognition (OCR) for scanned price lists and photos, with Tesseract
 * (https://github.com/tesseract-ocr/tesseract) through tesseract.js. It runs in the browser, in a
 * web worker, from files served by this site (`/ocr/`, copied from node_modules by
 * scripts/copy-ocr-assets.mjs) — nothing is downloaded from another site and the file never leaves
 * the computer. The words it finds go into the same table rebuilding as the text of a PDF.
 */
export interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}
export interface OcrLine {
  words: OcrWord[];
  baseline?: { x0: number; y0: number; x1: number; y1: number; has_baseline?: boolean };
}
export interface OcrPage {
  lines: OcrLine[];
  /** Mean confidence of the words, 0–100. */
  confidence: number;
}

/** What the engine takes: a canvas or image bytes. */
export type OcrImage = Uint8Array | Blob | HTMLCanvasElement | OffscreenCanvas;

export interface OcrEngine {
  recognize(image: OcrImage): Promise<OcrPage>;
  /** Reads one short number in a picture of just that number: digits, point, comma and % only. */
  recognizeNumber(image: OcrImage): Promise<{ text: string; confidence: number } | null>;
  close(): Promise<void>;
}

export interface OcrOptions {
  /** Where the engine's files are served; defaults to this site's /ocr/. */
  workerPath?: string;
  corePath?: string;
  langPath?: string;
  /** Progress of loading the engine and of the page being read, 0–1, with a status. */
  onStatus?: (status: string, progress: number) => void;
}

export async function createOcr(opts: OcrOptions = {}): Promise<OcrEngine> {
  const { createWorker } = await import("tesseract.js");
  const web = typeof document !== "undefined";
  const base = web ? "/ocr" : undefined;
  // Node has its own defaults for these; undefined would override them.
  const paths: Record<string, string> = {};
  if (opts.workerPath ?? base) paths.workerPath = opts.workerPath ?? `${base}/worker.min.js`;
  if (opts.corePath ?? base) paths.corePath = (opts.corePath ?? base)!;
  if (opts.langPath ?? base) paths.langPath = (opts.langPath ?? base)!;
  const worker = await createWorker("eng", 1, {
    ...paths,
    // A worker script from our own address (the page's security policy does not allow blob: scripts).
    workerBlobURL: false,
    gzip: true,
    // Node (tests) must not write the language file into the working directory.
    cacheMethod: web ? "write" : "none",
    logger: (m: { status: string; progress: number }) => opts.onStatus?.(m.status, m.progress),
    errorHandler: () => {},
  } as Parameters<typeof createWorker>[2]);
  // One block of text, with the spaces between table cells kept.
  await worker.setParameters({ tessedit_pageseg_mode: "6" as never, preserve_interword_spaces: "1", user_defined_dpi: "300" });
  return {
    async recognize(image) {
      const { data } = await worker.recognize(image as never, {}, { blocks: true });
      const lines: OcrLine[] = [];
      for (const block of data.blocks ?? []) {
        for (const para of block.paragraphs) {
          for (const line of para.lines) {
            lines.push({
              baseline: line.baseline,
              words: line.words.map((w) => ({ text: w.text, confidence: w.confidence, bbox: w.bbox })),
            });
          }
        }
      }
      const words = lines.flatMap((l) => l.words);
      const confidence = words.length ? words.reduce((n, w) => n + w.confidence, 0) / words.length : 0;
      return { lines, confidence };
    },
    async recognizeNumber(image) {
      await worker.setParameters({ tessedit_pageseg_mode: "7" as never, tessedit_char_whitelist: "0123456789.,%" });
      try {
        const { data } = await worker.recognize(image as never, {}, { blocks: true });
        const words = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
        return words.length === 1 ? { text: words[0].text.trim(), confidence: words[0].confidence } : null;
      } finally {
        await worker.setParameters({ tessedit_pageseg_mode: "6" as never, tessedit_char_whitelist: "" });
      }
    },
    close: () => worker.terminate().then(() => undefined),
  };
}

/** Size of a font in points that the layout step sees; recognised text is scaled to it. */
const FONT = 9;
/** Cap/ascender height as a share of the font size. */
const ASCENT = 0.72;
/** Marks left where the scanner caught a table border, not letters. */
const BORDER_JUNK = /^[|_¦\[\]{}\\~=]{1,3}$/;

/** A "word" far wider than its letters could be is a line or a smudge. */
function stretched(w: OcrWord): boolean {
  const h = Math.max(1, w.bbox.y1 - w.bbox.y0);
  return w.bbox.x1 - w.bbox.x0 > 2.2 * h * Math.max(1, w.text.trim().length) + 8;
}

/** Height of the text in pixels: how far letters rise above the baseline, typically. */
export function textHeightOf(page: OcrPage): number {
  const ascents = page.lines
    .flatMap((l) => l.words.map((w) => baselineAt(l, w, (w.bbox.x0 + w.bbox.x1) / 2) - w.bbox.y0))
    .filter((a) => a > 2)
    .sort((a, b) => a - b);
  return ascents[Math.floor(ascents.length / 2)] || 0;
}

function baselineAt(l: OcrLine, w: OcrWord, x: number): number {
  const b = l.baseline;
  if (b && b.has_baseline !== false && b.x1 > b.x0) return b.y0 + ((x - b.x0) * (b.y1 - b.y0)) / (b.x1 - b.x0);
  return w.bbox.y1 - 0.2 * (w.bbox.y1 - w.bbox.y0);
}

/**
 * Words → positioned text in the units the layout step expects (points; text is about 9 high). Words close
 * together on a line are one piece, a cell — but never across a vertical table border; where the
 * table has borders the words of a cell can be set further apart. The page should be straight.
 */
export function pageFromOcr(page: OcrPage, rules: Rule[] = [], unitsPerPixel?: number): PageText {
  const lines = page.lines
    .map((l) => ({ ...l, words: l.words.filter((w) => w.text.trim() && !BORDER_JUNK.test(w.text.trim()) && !(w.confidence < 15 && w.text.trim().length <= 2 && !/\d/.test(w.text)) && !stretched(w)) }))
    .filter((l) => l.words.length);
  const ascent = textHeightOf({ ...page, lines });
  if (!lines.length || !ascent) return { pieces: [] };
  // Given for the pages of a PDF, so that all pages share one scale; a lone picture is scaled by its text.
  const scale = unitsPerPixel ?? (FONT * ASCENT) / ascent;
  const verticals = rules.filter((r) => Math.abs(r.x1 - r.x0) <= 1 && Math.abs(r.y1 - r.y0) >= 3 * ascent);
  const gapMax = (verticals.length >= 3 ? 2.5 : 0.9) * ascent;
  const crosses = (xa: number, xb: number, y: number) => verticals.some((r) => r.x0 > xa - 1 && r.x0 < xb + 1 && Math.min(r.y0, r.y1) <= y && Math.max(r.y0, r.y1) >= y);

  const pieces: TextPiece[] = [];
  for (const l of lines) {
    const placed = l.words
      .map((w) => ({ text: w.text.trim(), x0: w.bbox.x0, x1: w.bbox.x1, y: baselineAt(l, w, (w.bbox.x0 + w.bbox.x1) / 2), a: Math.max(1, baselineAt(l, w, (w.bbox.x0 + w.bbox.x1) / 2) - w.bbox.y0) }))
      .sort((p, q) => p.x0 - q.x0);
    let run: { x0: number; x1: number; y: number; a: number; text: string } | null = null;
    const flush = () => {
      if (run) pieces.push({ x: run.x0 * scale, y: run.y * scale, w: (run.x1 - run.x0) * scale, h: Math.max(FONT * 0.8, (Math.max(run.a, ascent * 0.9) / ASCENT) * scale), str: run.text });
      run = null;
    };
    for (const w of placed) {
      if (run && w.x0 - run.x1 <= gapMax && !crosses(run.x1, w.x0, w.y - ascent / 2)) {
        run.text += ` ${w.text}`;
        run.x1 = Math.max(run.x1, w.x1);
        run.a = Math.max(run.a, w.a);
      } else {
        flush();
        run = { x0: w.x0, x1: w.x1, y: w.y, a: w.a, text: w.text };
      }
    }
    flush();
  }
  return {
    pieces,
    rules: rules.map((r) => ({ x0: r.x0 * scale, y0: r.y0 * scale, x1: r.x1 * scale, y1: r.y1 * scale })),
  };
}
