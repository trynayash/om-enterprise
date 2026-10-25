import { tablesFromPages, type PageText, type TextPiece } from "./layout";
import { pictureCoverage, piecesFromOperators, type FontInfo } from "./pdf-ops";
import { CANCELLED, type ReadOptions } from "./read-options";
import { browserCanvasKit, lazyOcr, leftEdge, readScan, shifted, type Canvas2D, type CanvasKit, type ScanSession } from "./scan";
import type { ImportTable } from "./text";

/**
 * PDF price lists and catalogues, read with Mozilla's pdf.js (https://github.com/mozilla/pdf.js).
 * Each page's text-drawing operations and their positions come from pdf.js (./pdf-ops); the
 * tables are rebuilt in ./layout. pdf.js runs on the page's own thread (its worker module is
 * loaded as a regular module), so no separate worker file or relaxed content-security policy is
 * needed. Pictures are skipped while reading the text, which keeps photo-heavy catalogues fast.
 * Pages that are only a picture of text (scans) are drawn and read with text recognition (./scan).
 */
const MAX_PAGES = 400;
/** Scanned pages take seconds each; more than this is better split. */
const MAX_SCANNED_PAGES = 120;
const FONT_WAIT_MS = 3000;
/** A page with this few characters of text and a picture on it is a scan (with a page number), not a text page. */
const SPARSE_CHARS = 40;
/** A scan is one picture covering about this much of the page. */
const SCAN_COVERAGE = 0.5;
/** The long side, in pixels, a scanned page is drawn at: A4 at about 280 dpi. */
const SCAN_SIDE = 3300;

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type Doc = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;
type Page = Awaited<ReturnType<Doc["getPage"]>>;

/** pdf.js's canvas maker: browser canvases in the page, Node canvases in tests. */
interface CanvasFactory {
  create(width: number, height: number): { canvas: Canvas2D; context: unknown };
  destroy(entry: { canvas: Canvas2D; context: unknown }): void;
}

export interface PdfResult {
  tables: ImportTable[];
  /** Some pages were scans, read with text recognition: numbers need checking. */
  scanned: boolean;
  /** Mean recognition confidence of the scanned pages, 0–100. */
  confidence: number;
}

export async function readPdf(data: Uint8Array, opts: ReadOptions = {}): Promise<PdfResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const settings = { disableFontFace: true, useSystemFonts: false, verbosity: 0, stopAtErrors: false };
  const task = pdfjs.getDocument({ data: data.slice(), ...settings, maxImageSize: 1 });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    await task.destroy();
    const name = (err as { name?: string })?.name;
    if (name === "PasswordException") throw new Error("That PDF is password-protected. Open it, save a copy without the password, and upload that.");
    throw new Error("That file is not a readable PDF");
  }
  let pictures: Doc | null = null;
  let picturesTask: ReturnType<PdfJs["getDocument"]> | null = null;
  const ocr = lazyOcr(opts);
  try {
    if (doc.numPages > MAX_PAGES) throw new Error(`That PDF has ${doc.numPages} pages; split it into files of up to ${MAX_PAGES} pages.`);
    const pages: PageText[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      if (opts.signal?.aborted) throw new Error(CANCELLED);
      const page = await doc.getPage(p);
      let text: PageText;
      try {
        text = await textOfPage(pdfjs, page);
      } catch {
        text = { pieces: [] };
      }
      // pdf.js's own text extraction, when following the drawing operations finds nothing.
      if (!text.pieces.length) text = { pieces: await textContentOf(pdfjs, page) };
      pages.push(text);
      page.cleanup();
      opts.onProgress?.({ stage: "page", done: p, total: doc.numPages });
      // Let the page repaint (the progress message) between PDF pages.
      if (opts.onProgress) await new Promise((r) => setTimeout(r, 0));
    }

    // Pages with no text but a picture of text: scans.
    let scanned = false;
    let confidenceSum = 0;
    const candidates = pages.flatMap((t, i) => (t.pieces.reduce((n, p) => n + p.str.length, 0) <= SPARSE_CHARS ? [i] : []));
    if (candidates.length) {
      const wasmUrl = opts.pdfWasmUrl ?? (typeof document !== "undefined" ? "/pdfjs/wasm/" : undefined);
      picturesTask = pdfjs.getDocument({ data: data.slice(), ...settings, ...(wasmUrl ? { wasmUrl } : {}) });
      pictures = await picturesTask.promise;
      const factory = pictures.canvasFactory as unknown as CanvasFactory;
      const withPicture: number[] = [];
      for (const i of candidates) {
        const page = await pictures.getPage(i + 1);
        if (await isScan(pdfjs, page)) withPicture.push(i);
        page.cleanup();
      }
      if (withPicture.length > MAX_SCANNED_PAGES) throw new Error(`That PDF has ${withPicture.length} scanned pages; split it into files of up to ${MAX_SCANNED_PAGES} pages.`);
      const session: ScanSession = { quarters: 0 };
      const kit: CanvasKit = { create: (w, h) => factory.create(w, h).canvas, decode: browserCanvasKit.decode };
      for (const [n, i] of withPicture.entries()) {
        if (opts.signal?.aborted) throw new Error(CANCELLED);
        opts.onProgress?.({ stage: "scan", done: n, total: withPicture.length });
        const engine = await ocr.get();
        const page = await pictures.getPage(i + 1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(4, Math.max(1, SCAN_SIDE / Math.max(base.width, base.height))) });
        const entry = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
        try {
          await page.render({ canvasContext: entry.context as never, canvas: entry.canvas as never, viewport, background: "rgb(255,255,255)" }).promise;
          const scan = await readScan(entry.canvas, engine, kit, session, viewport.scale);
          // Keep the text that was found as well, when the page had a little of its own.
          pages[i] = scan.page.pieces.length ? scan.page : pages[i];
          scanned = true;
          confidenceSum += scan.confidence;
        } finally {
          factory.destroy(entry);
          page.cleanup();
        }
        opts.onProgress?.({ stage: "scan", done: n + 1, total: withPicture.length });
      }
      alignScans(pages, withPicture);
    }
    if (!pages.some((p) => p.pieces.length)) {
      throw new Error("This PDF has no text and no pictures of text to read. Ask the company for the original PDF or Excel file, or type the rows into the Excel template.");
    }
    return { tables: tablesFromPages(pages), scanned, confidence: scanned ? confidenceSum / Math.max(1, candidates.length) : 0 };
  } finally {
    await ocr.close();
    await picturesTask?.destroy();
    await task.destroy();
  }
}

/** Scans of the pages of one document sit a little differently on each page; line the tables up with the first. */
function alignScans(pages: PageText[], scanned: number[]) {
  if (scanned.length < 2) return;
  const reference = leftEdge(pages[scanned[0]]);
  for (const i of scanned.slice(1)) pages[i] = shifted(pages[i], reference - leftEdge(pages[i]));
}

/** True when one picture covers most of the page: a page of text that was scanned. */
async function isScan(pdfjs: PdfJs, page: Page): Promise<boolean> {
  const list = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE });
  const viewport = page.getViewport({ scale: 1 });
  return pictureCoverage(list.fnArray, list.argsArray, pdfjs.OPS, viewport.transform, viewport.width, viewport.height) >= SCAN_COVERAGE;
}

async function textOfPage(pdfjs: PdfJs, page: Page): Promise<PageText> {
  const list = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE });
  const fonts = new Map<string, FontInfo | undefined>();
  list.fnArray.forEach((fn, i) => {
    if (fn === pdfjs.OPS.setFont) fonts.set(String((list.argsArray[i] as unknown[])[0]), undefined);
  });
  for (const name of fonts.keys()) fonts.set(name, await fontOf(page, name));
  // A page whose text is mostly sideways is read turned so that the text runs left to right.
  let best: PageText = { pieces: [] };
  for (const turn of [0, 90, 270, 180]) {
    const viewport = page.getViewport({ scale: 1, rotation: (page.rotate + turn) % 360 });
    const { pieces, rules, sideways } = piecesFromOperators(list.fnArray, list.argsArray, pdfjs.OPS, viewport.transform, (name) => fonts.get(name), pdfjs.normalizeUnicode);
    // Text placed outside the page is not part of what the reader sees.
    const shown = pieces.filter((p) => p.x < viewport.width && p.x + p.w > 0 && p.y > 0 && p.y - p.h < viewport.height);
    if (shown.length > best.pieces.length) best = { pieces: shown, rules };
    if (shown.length >= sideways) break;
  }
  return best;
}

function fontOf(page: Page, name: string): Promise<FontInfo | undefined> {
  const objs = page.commonObjs as unknown as { has(id: string): boolean; get(id: string, cb?: (v: unknown) => void): unknown };
  if (objs.has(name)) return Promise.resolve(objs.get(name) as FontInfo);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), FONT_WAIT_MS);
    try {
      objs.get(name, (font) => {
        clearTimeout(timer);
        resolve(font as FontInfo);
      });
    } catch {
      clearTimeout(timer);
      resolve(undefined);
    }
  });
}

async function textContentOf(pdfjs: PdfJs, page: Page): Promise<TextPiece[]> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items: TextPiece[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    const [a, b, c, d, e, f] = pdfjs.Util.transform(viewport.transform, item.transform);
    if (Math.abs(b) > Math.abs(a)) continue;
    items.push({ x: e, y: f, w: item.width * Math.hypot(viewport.transform[0], viewport.transform[1]), h: Math.hypot(c, d) || item.height, str: item.str });
  }
  return items;
}
