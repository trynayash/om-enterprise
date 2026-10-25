import { cropOf, imageOf, type Canvas2D, type CanvasKit } from "./canvas";
import type { OcrEngine, OcrLanguage, OcrLine, OcrPage, OcrWord } from "./ocr";
import { toAsciiDigits } from "./text";

/**
 * Second readings of the words text recognition is least sure of, each cut out of the page and read
 * on its own with an engine set up for that kind of word. The first reading of a whole page decides
 * where everything is; these fix what was read wrong in it.
 */

/** A word that is only digits and number punctuation, two characters or more: a price, a quantity, a percentage. */
const NUMBER = /^[\d.,%]{2,}$/;
const NUMBER_CHARACTERS = "0123456789.,%";
/** Height, in pixels, a number is enlarged to when it is read again on its own. */
const NUMBER_HEIGHT = 56;

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
 * Whether the second reading of an item code should replace the first. A lost separator is the usual
 * slip ("GJ-101" read as "GJ101"): when both have the same letters and digits the one with more
 * separators wins; when they differ the second wins unless the engine is clearly less sure of it.
 */
export function betterCode(first: string, firstConfidence: number, second: string, secondConfidence: number): boolean {
  if (second === first) return false;
  const bare = (t: string) => t.replace(/[-./_]/g, "");
  if (bare(first) === bare(second)) return second.length > first.length;
  return secondConfidence >= firstConfidence - 5;
}

const heightOf = (w: OcrWord) => w.bbox.y1 - w.bbox.y0;

/**
 * Numbers are what matters most and what the engine slips on most (a decimal point lost between two
 * digits turns 24.3 into 243), so each one is read again on its own: cut out, enlarged and limited
 * to digits. The second reading replaces the first when it is a number too and the engine is not
 * clearly less sure of it.
 */
export async function rereadNumbers(page: OcrPage, canvas: Canvas2D, engine: OcrEngine, kit: CanvasKit): Promise<OcrPage> {
  const lines: OcrLine[] = [];
  for (const line of page.lines) {
    const words: OcrWord[] = [];
    for (const w of line.words) {
      const text = w.text.trim();
      if (!NUMBER.test(text) || heightOf(w) < 6) {
        words.push(w);
        continue;
      }
      const again = await engine.recognizeLine(imageOf(cropOf(canvas, w.bbox, heightOf(w), NUMBER_HEIGHT, kit, 0.4, 0.3)), NUMBER_CHARACTERS);
      words.push(again && NUMBER.test(again.text) && betterNumber(text, w.confidence, again.text, again.confidence) ? { ...w, text: again.text, confidence: again.confidence } : w);
    }
    lines.push({ ...line, words });
  }
  return { ...page, lines };
}

// ---- Hindi and Gujarati ----

export type IndicLanguage = Exclude<OcrLanguage, "eng">;

/** What reading in Hindi or Gujarati needs besides the main engine: one engine for each script alone. */
export interface IndicSupport {
  languages: IndicLanguage[];
  engineFor(language: IndicLanguage): Promise<OcrEngine>;
}

const SCRIPT: Record<IndicLanguage, RegExp> = { hin: /[\u0900-\u097F]/g, guj: /[\u0A80-\u0AFF]/g };
const ANY_INDIC = /[\u0900-\u097F\u0A80-\u0AFF]/;
const LETTER = new RegExp("[\\p{L}\\p{M}]", "u");
/** Stray quote and bar marks the engine adds at the ends of a phrase (a degree sign cut by the crop reads as an apostrophe). */
const STRAY_ENDS = /^[\s'"‘’“”`|]+|[\s'"‘’“”`|]+$/g;
/** Latin letters, digits and the marks of item codes. */
const CODE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const CODE_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-./_";
/** Below this confidence a word is read again. Words read correctly score above it; made-up ones ("gear" for एल्बो) well below. */
const WEAK = 75;
/** Height, in pixels, a phrase or code is enlarged to when it is read again. */
const LINE_HEIGHT = 60;

const indicChars = (text: string, language: IndicLanguage) => text.match(SCRIPT[language])?.length ?? 0;

/**
 * The engine reads Hindi and Gujarati best on its own, but only English and digits with English
 * alongside, so a page read in two languages gets the best of both:
 *  - a phrase of Hindi or Gujarati where some word was weakly read (the combined engine turns joined
 *    letters into English nonsense: "एल्बो" → "gear") is read again by the engine for that script alone;
 *  - an item code, which the combined engine can mistake for the other script ("GJ-101" → "62-101"), is
 *    read again limited to Latin letters, digits and code punctuation.
 * A second reading replaces the first only when it is plainly better.
 */
export async function rereadIndic(page: OcrPage, canvas: Canvas2D, engine: OcrEngine, kit: CanvasKit, indic: IndicSupport): Promise<OcrPage> {
  const heights = page.lines.flatMap((l) => l.words.map(heightOf)).sort((a, b) => a - b);
  const typical = heights[Math.floor(heights.length / 2)] || 20;
  const lines: OcrLine[] = [];
  for (const line of page.lines) {
    const words = [...line.words].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const out: OcrWord[] = [];
    for (let i = 0; i < words.length; ) {
      // A phrase: neighbouring words made of letters, set close together.
      let j = i;
      if (LETTER.test(words[i].text)) while (j + 1 < words.length && LETTER.test(words[j + 1].text) && words[j + 1].bbox.x0 - words[j].bbox.x1 <= 1.3 * typical) j++;
      const phrase = words.slice(i, j + 1);
      i = j + 1;
      const better = (await rereadPhrase(phrase, canvas, kit, indic, typical)) ?? (await rereadCode(phrase, canvas, engine, kit, typical));
      out.push(...(better ?? phrase));
    }
    lines.push({ ...line, words: out });
  }
  return { ...page, lines };
}

/** A weakly read Hindi or Gujarati phrase, read again by the engine for its script. */
async function rereadPhrase(phrase: OcrWord[], canvas: Canvas2D, kit: CanvasKit, indic: IndicSupport, typical: number): Promise<OcrWord[] | null> {
  const text = phrase.map((w) => w.text).join(" ");
  // A lone word with digits is a code or a number, not a name.
  if (phrase.length === 1 && /\d/.test(toAsciiDigits(text))) return null;
  const weakest = Math.min(...phrase.map((w) => w.confidence));
  // A weak English word among Hindi or Gujarati words is nearly always the combined engine's nonsense for joined letters.
  const nonsense = phrase.some((w) => w.confidence < WEAK && !ANY_INDIC.test(w.text) && /[A-Za-z]/.test(w.text));
  const language = indic.languages.map((l) => ({ l, n: indicChars(text, l) })).sort((a, b) => b.n - a.n)[0];
  if (!language || !language.n || weakest >= WEAK) return null;
  const box = {
    x0: Math.min(...phrase.map((w) => w.bbox.x0)),
    y0: Math.min(...phrase.map((w) => w.bbox.y0)),
    x1: Math.max(...phrase.map((w) => w.bbox.x1)),
    y1: Math.max(...phrase.map((w) => w.bbox.y1)),
  };
  const again = await (await indic.engineFor(language.l)).recognizeLine(imageOf(cropOf(canvas, box, Math.max(typical, box.y1 - box.y0) * 0.75, LINE_HEIGHT, kit)));
  if (!again) return null;
  const reread = again.text.replace(STRAY_ENDS, "");
  // It must be the same script, and clearly better than the weakest word it replaces; or, in place of nonsense, more of the script than was found.
  if (!indicChars(reread, language.l) || reread === text) return null;
  const clearlyBetter = again.confidence >= weakest + 10 || (nonsense && again.confidence >= 50 && indicChars(reread, language.l) > language.n);
  return clearlyBetter ? [{ text: reread, confidence: again.confidence, bbox: { ...box } }] : null;
}

/** An item code read again limited to the characters of codes. */
async function rereadCode(phrase: OcrWord[], canvas: Canvas2D, engine: OcrEngine, kit: CanvasKit, typical: number): Promise<OcrWord[] | null> {
  if (phrase.length !== 1) return null;
  const w = phrase[0];
  const text = w.text.trim();
  // Code-like: digits and a separator in a short word (the combined engine may have turned its letters into the other
  // script's), or letters and digits run together (the separator may have been lost).
  const ascii = toAsciiDigits(text);
  const separated = ascii.length >= 3 && ascii.length <= 16 && /\d.*\d/.test(ascii) && /[-/.]/.test(ascii);
  const joined = /^[A-Za-z]{1,6}\d{2,8}$/.test(ascii);
  if (!(separated || joined) || NUMBER.test(ascii) || /\s/.test(ascii)) return null;
  if (!CODE.test(text) && !ANY_INDIC.test(text)) return null;
  const again = await engine.recognizeLine(imageOf(cropOf(canvas, w.bbox, Math.max(typical, heightOf(w)), LINE_HEIGHT, kit)), CODE_CHARACTERS);
  if (!again || !CODE.test(again.text) || !betterCode(text, w.confidence, again.text, again.confidence)) return null;
  return [{ ...w, text: again.text, confidence: again.confidence }];
}
