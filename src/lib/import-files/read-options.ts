import type { OcrOptions } from "./ocr";
import type { CanvasKit } from "./scan";

/** What a file read is doing, for the message shown while it runs. */
export type ReadProgress =
  | { stage: "page"; done: number; total: number }
  /** Getting the text recognition engine ready (the first time, it is downloaded from this site). */
  | { stage: "engine"; progress: number }
  /** Recognising the text of a scanned page. */
  | { stage: "scan"; done: number; total: number };

export interface ReadOptions {
  onProgress?: (p: ReadProgress) => void;
  /** Stops a long read (scanned pages take several seconds each). */
  signal?: AbortSignal;
  /** Where the recognition engine's files are; the browser uses this site's /ocr/. Set by tests. */
  ocr?: OcrOptions;
  /** Makes canvases and opens picture files; the browser's by default. Set by tests. */
  canvasKit?: CanvasKit;
  /** Where pdf.js finds its WebAssembly decoders (JBIG2, JPEG 2000); this site's /pdfjs/wasm/ in the browser. */
  pdfWasmUrl?: string;
}

export const CANCELLED = "Cancelled";

/**
 * `promise`, but rejected with CANCELLED as soon as `signal` aborts. A worker that is stopped in the
 * middle of a job never answers it, so waiting for the job would wait for ever.
 */
export function raceAbort<T>(signal: AbortSignal | undefined, promise: Promise<T>): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new Error(CANCELLED));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error(CANCELLED));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
