/**
 * Copies the files the browser needs to read scanned price lists from node_modules into public/,
 * so they are served from this site (nothing is loaded from another address):
 *   public/ocr/    Tesseract text recognition (tesseract.js worker, WebAssembly core, English data)
 *   public/pdfjs/  pdf.js's WebAssembly decoders for scan compressions (JBIG2, JPEG 2000, ICC colours)
 * Runs before `next dev` and `next build` (see package.json). The copies are not committed.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modules = join(root, "node_modules");

const copies = [
  ["tesseract.js/dist/worker.min.js", "public/ocr/worker.min.js"],
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "public/ocr/tesseract-core-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "public/ocr/tesseract-core-simd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "public/ocr/tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "public/ocr/eng.traineddata.gz"],
];
// pdf.js's decoders and their licences; its scripting engine (quickjs) is not needed.
const pdfjs = join(modules, "pdfjs-dist/wasm");
if (existsSync(pdfjs)) for (const f of readdirSync(pdfjs)) if (!f.startsWith("quickjs")) copies.push([`pdfjs-dist/wasm/${f}`, `public/pdfjs/wasm/${f}`]);

for (const [from, to] of copies) {
  const src = join(modules, from);
  if (!existsSync(src)) {
    console.error(`copy-engine-files: ${from} is missing — run npm install`);
    process.exit(1);
  }
  mkdirSync(dirname(join(root, to)), { recursive: true });
  copyFileSync(src, join(root, to));
}
writeFileSync(
  join(root, "public/ocr/README.txt"),
  "Copies of open-source files, made by scripts/copy-engine-files.mjs:\n" +
    "- worker.min.js, tesseract-core-*.wasm.js: tesseract.js and tesseract.js-core (Apache-2.0), https://github.com/naptha/tesseract.js\n" +
    "- eng.traineddata.gz: Tesseract English model 4.0.0_best_int (Apache-2.0), https://github.com/tesseract-ocr/tessdata_best\n",
);
