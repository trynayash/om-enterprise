import { tablesFromPages, type PageText, type TextPiece } from "./layout";
import { piecesFromOperators, type FontInfo } from "./pdf-ops";
import type { ImportTable } from "./text";

/**
 * PDF price lists and catalogues, read with Mozilla's pdf.js (https://github.com/mozilla/pdf.js).
 * Each page's text-drawing operations and their positions come from pdf.js (./pdf-ops); the
 * tables are rebuilt in ./layout. pdf.js runs on the page's own thread (its worker module is
 * loaded as a regular module), so no separate worker file or relaxed content-security policy is
 * needed. Pictures are skipped — only the text is needed — which keeps photo-heavy catalogues fast.
 */
const MAX_PAGES = 400;
const FONT_WAIT_MS = 3000;

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type Page = Awaited<ReturnType<Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>["getPage"]>>;

export async function readPdf(data: Uint8Array, onPage?: (done: number, total: number) => void): Promise<ImportTable[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const task = pdfjs.getDocument({
    data: data.slice(),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
    stopAtErrors: false,
    maxImageSize: 1,
  });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    await task.destroy();
    const name = (err as { name?: string })?.name;
    if (name === "PasswordException") throw new Error("That PDF is password-protected. Open it, save a copy without the password, and upload that.");
    throw new Error("That file is not a readable PDF");
  }
  try {
    if (doc.numPages > MAX_PAGES) throw new Error(`That PDF has ${doc.numPages} pages; split it into files of up to ${MAX_PAGES} pages.`);
    const pages: PageText[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
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
      onPage?.(p, doc.numPages);
      // Let the page repaint (the progress message) between PDF pages.
      if (onPage) await new Promise((r) => setTimeout(r, 0));
    }
    if (!pages.some((p) => p.pieces.length)) {
      throw new Error("This PDF has no text to read — it is a scan or a photo. Ask the company for the original PDF or Excel file, or type the rows into the Excel template.");
    }
    return tablesFromPages(pages);
  } finally {
    await task.destroy();
  }
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
