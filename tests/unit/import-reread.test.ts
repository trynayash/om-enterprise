import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import type { CanvasKit } from "@/lib/import-files/canvas";
import { OCR_LANGUAGE_CHOICES, type OcrEngine, type OcrLine, type OcrPage, type OcrWord } from "@/lib/import-files/ocr";
import { betterCode, rereadIndic, type IndicLanguage } from "@/lib/import-files/reread";

const kit: CanvasKit = {
  create: (w, h) => createCanvas(w, h) as never,
  decode: async () => {
    throw new Error("not used");
  },
};
const canvas = () => kit.create(900, 300);

const word = (text: string, confidence: number, x0: number, y = 100): OcrWord => ({ text, confidence, bbox: { x0, y0: y, x1: x0 + 20 * Math.max(2, text.length), y1: y + 28 } });
const page = (...lines: OcrWord[][]): OcrPage => ({ confidence: 80, lines: lines.map((words): OcrLine => ({ words })) });
const texts = (p: OcrPage) => p.lines.map((l) => l.words.map((w) => w.text));

/** An engine that answers each line reading with the next of `answers`, and remembers what it was asked. */
function fakeEngine(answers: ({ text: string; confidence: number } | null)[]) {
  const asked: (string | undefined)[] = [];
  const engine: OcrEngine = {
    recognize: async () => page(),
    recognizeLine: async (_image, characters) => {
      asked.push(characters);
      return answers.shift() ?? null;
    },
    close: async () => {},
  };
  return { engine, asked };
}

function indicEngines(answers: Partial<Record<IndicLanguage, ({ text: string; confidence: number } | null)[]>>, languages: IndicLanguage[] = ["hin"]) {
  const engines = Object.fromEntries(languages.map((l) => [l, fakeEngine(answers[l] ?? [])])) as Record<IndicLanguage, ReturnType<typeof fakeEngine>>;
  const opened: IndicLanguage[] = [];
  return {
    engines,
    opened,
    support: {
      languages,
      engineFor: async (l: IndicLanguage) => {
        opened.push(l);
        return engines[l].engine;
      },
    },
  };
}

describe("betterCode", () => {
  it("prefers the reading that kept the separator when the letters and digits agree", () => {
    expect(betterCode("GJ101", 90, "GJ-101", 80)).toBe(true);
    expect(betterCode("GJ-101", 80, "GJ101", 99)).toBe(false);
    expect(betterCode("GJ-101", 80, "GJ-101", 99)).toBe(false);
  });

  it("takes a different reading unless the engine is clearly less sure of it", () => {
    expect(betterCode("62-101", 60, "GJ-101", 70)).toBe(true);
    expect(betterCode("CH-101", 95, "GH-101", 60)).toBe(false);
  });
});

describe("rereadIndic", () => {
  it("reads a phrase with English nonsense in it again with the engine for its script", async () => {
    const t = indicEngines({ hin: [{ text: "सीपीवीसी एल्बो '", confidence: 60 }] });
    const main = fakeEngine([]);
    const out = await rereadIndic(page([word("सीपीवीसी", 91, 100), word("gest", 64, 260)]), canvas(), main.engine, kit, t.support);
    // One phrase, its stray apostrophe (a cut-off degree sign) dropped, over both words' place.
    expect(texts(out)).toEqual([["सीपीवीसी एल्बो"]]);
    expect(out.lines[0].words[0].bbox).toMatchObject({ x0: 100, x1: 340 });
    expect(t.opened).toEqual(["hin"]);
    expect(main.asked).toEqual([]);
  });

  it("uses the Gujarati engine for Gujarati words", async () => {
    const t = indicEngines({ guj: [{ text: "બૉલ વાલ્વ", confidence: 85 }] }, ["hin", "guj"]);
    const out = await rereadIndic(page([word("બોલ", 55, 100), word("વાલ્વ", 50, 170)]), canvas(), fakeEngine([]).engine, kit, t.support);
    expect(texts(out)).toEqual([["બૉલ વાલ્વ"]]);
    expect(t.opened).toEqual(["guj"]);
  });

  it("leaves words alone that the engine is sure of, and numbers", async () => {
    const t = indicEngines({});
    const main = fakeEngine([]);
    const before = page([word("बॉल", 93, 100), word("वाल्व", 90, 200)], [word("14.75", 95, 100, 200)], [word("15", 96, 100, 250), word("मिमी", 88, 160, 250)]);
    const out = await rereadIndic(before, canvas(), main.engine, kit, t.support);
    expect(texts(out)).toEqual(texts(before));
    expect(t.opened).toEqual([]);
    expect(main.asked).toEqual([]);
  });

  it("keeps the first reading when the second is not clearly better", async () => {
    const t = indicEngines({ hin: [{ text: "कपलर", confidence: 66 }] });
    const out = await rereadIndic(page([word("कपलर", 70, 100)]), canvas(), fakeEngine([]).engine, kit, t.support);
    expect(texts(out)).toEqual([["कपलर"]]);
  });

  it("keeps the first reading when the second has none of the script", async () => {
    const t = indicEngines({ hin: [{ text: "gear", confidence: 90 }] });
    const out = await rereadIndic(page([word("कपलर", 40, 100)]), canvas(), fakeEngine([]).engine, kit, t.support);
    expect(texts(out)).toEqual([["कपलर"]]);
  });

  it("reads an item code again with only the characters of codes, and keeps the hyphen it finds", async () => {
    const t = indicEngines({});
    const main = fakeEngine([
      { text: "GJ-101", confidence: 88 },
      { text: "62-101", confidence: 40 },
    ]);
    const out = await rereadIndic(page([word("GJ101", 90, 100)], [word("GJ-102", 90, 100, 200)]), canvas(), main.engine, kit, t.support);
    // The lost hyphen is back; a worse reading of a code with its hyphen does not replace it.
    expect(texts(out)).toEqual([["GJ-101"], ["GJ-102"]]);
    expect(main.asked).toHaveLength(2);
    expect(main.asked[0]).toContain("-");
    expect(main.asked[0]).not.toMatch(/[^A-Za-z0-9\-./_]/);
  });

  it("turns a code the combined engine read in the other script back into Latin letters", async () => {
    const t = indicEngines({});
    const main = fakeEngine([{ text: "GJ-101", confidence: 85 }]);
    const out = await rereadIndic(page([word("ગ્ર-101", 55, 100)]), canvas(), main.engine, kit, t.support);
    expect(texts(out)).toEqual([["GJ-101"]]);
  });
});

describe("OCR_LANGUAGE_CHOICES", () => {
  it("starts with English, and always lists English first in each choice", () => {
    expect(OCR_LANGUAGE_CHOICES[0]).toMatchObject({ id: "eng", languages: ["eng"] });
    expect(new Set(OCR_LANGUAGE_CHOICES.map((c) => c.id)).size).toBe(OCR_LANGUAGE_CHOICES.length);
    for (const c of OCR_LANGUAGE_CHOICES) expect(c.languages[0]).toBe("eng");
    expect(OCR_LANGUAGE_CHOICES.map((c) => c.languages.join("+"))).toEqual(["eng", "eng+hin", "eng+guj", "eng+hin+guj"]);
  });
});
