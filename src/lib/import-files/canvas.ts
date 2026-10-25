import type { OcrImage } from "./ocr";

/**
 * The little of the canvas API that reading scans uses, so that it runs on the page's canvases in the
 * browser and on Node's in tests.
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

export function ctxOf(canvas: Canvas2D): CanvasCtx {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't process pictures.");
  return ctx;
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

/** What the recognition engine is given for a canvas: PNG bytes in Node, the canvas itself in the browser. */
export const imageOf = (canvas: Canvas2D): OcrImage => (typeof canvas.toBuffer === "function" ? canvas.toBuffer("image/png") : (canvas as unknown as HTMLCanvasElement));

/**
 * The part of a canvas inside a box, with a margin, enlarged so that text of `textHeight` pixels
 * comes out about `target` pixels tall (never reduced, at most 4 times larger).
 */
export function cropOf(canvas: Canvas2D, box: { x0: number; y0: number; x1: number; y1: number }, textHeight: number, target: number, kit: CanvasKit, marginX = 0.5, marginY = 0.35): Canvas2D {
  const padX = Math.round(textHeight * marginX);
  const padY = Math.round(textHeight * marginY);
  const x0 = Math.max(0, Math.floor(box.x0 - padX));
  const y0 = Math.max(0, Math.floor(box.y0 - padY));
  const w = Math.max(1, Math.min(canvas.width, Math.ceil(box.x1 + padX)) - x0);
  const h = Math.max(1, Math.min(canvas.height, Math.ceil(box.y1 + padY)) - y0);
  const zoom = Math.min(4, Math.max(1, target / Math.max(1, textHeight)));
  const out = kit.create(Math.max(8, Math.round(w * zoom)), Math.max(8, Math.round(h * zoom)));
  const ctx = ctxOf(out);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, x0, y0, w, h, 0, 0, out.width, out.height);
  return out;
}
