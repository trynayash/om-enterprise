import { describe, expect, it } from "vitest";
import { evenLight, inkBox, rulesOf, skewOf, toGray, unevenLight, type Gray } from "@/lib/import-files/raster";
import { pageFromOcr, textHeightOf, type OcrLine, type OcrPage } from "@/lib/import-files/ocr";
import { betterNumber, leftEdge, shifted } from "@/lib/import-files/scan";
import { tablesFromPages } from "@/lib/import-files/layout";

/** A white page as a grey image, with a way to draw dark rectangles on it. */
function page(width: number, height: number, paper = 250) {
  const data = new Uint8Array(width * height).fill(paper);
  const g: Gray = { data, width, height };
  const rect = (x0: number, y0: number, x1: number, y1: number, v = 20) => {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(height, Math.round(y1)); y++) for (let x = Math.max(0, Math.round(x0)); x < Math.min(width, Math.round(x1)); x++) data[y * width + x] = v;
  };
  return { g, rect, data };
}

/** Lines of "text": rows of short dark dashes, as wide as a few letters. */
function textLines(p: ReturnType<typeof page>, left: number, top: number, rows: number, pitch: number, slope = 0) {
  for (let r = 0; r < rows; r++) {
    for (let x = left; x < p.g.width - left; x += 22) p.rect(x, top + r * pitch + (x - left) * slope, x + 14, top + r * pitch + 10 + (x - left) * slope);
  }
}

describe("toGray", () => {
  it("turns RGBA pixels into grey", () => {
    const g = toGray({ width: 2, height: 1, data: [255, 255, 255, 255, 0, 0, 0, 255] });
    expect(Array.from(g.data as Uint8Array)).toEqual([255, 0]);
  });
});

describe("skewOf", () => {
  it("is 0 for straight lines of text", () => {
    const p = page(900, 1200);
    textLines(p, 60, 80, 40, 26);
    expect(skewOf(p.g)).toBe(0);
  });

  it("finds how far the lines are tilted, to within a fraction of a degree", () => {
    for (const deg of [-2.5, -1, 1.2, 3]) {
      const p = page(900, 1200);
      textLines(p, 60, 120, 36, 26, Math.tan((deg * Math.PI) / 180));
      expect((skewOf(p.g) * 180) / Math.PI).toBeCloseTo(deg, 0);
    }
  });

  it("leaves a nearly blank page alone", () => {
    expect(skewOf(page(500, 500).g)).toBe(0);
  });
});

describe("rulesOf", () => {
  it("finds the long lines of a table, but not letters, underlines or short marks", () => {
    const p = page(1000, 800);
    // A grid: 4 horizontal lines and 3 vertical ones, 2 px thick.
    for (const y of [100, 160, 220, 280]) p.rect(80, y, 900, y + 2);
    for (const x of [80, 400, 898]) p.rect(x, 100, x + 2, 282);
    // Things that are not borders: a short underline, a tall letter, a dashed run.
    p.rect(500, 400, 560, 402);
    p.rect(600, 500, 604, 530);
    textLines(p, 100, 600, 3, 30);
    const rules = rulesOf(p.g, 14);
    const h = rules.filter((r) => r.y0 === r.y1);
    const v = rules.filter((r) => r.x0 === r.x1);
    expect(h.map((r) => r.y0)).toEqual([100.5, 160.5, 220.5, 280.5]);
    expect(h.every((r) => r.x0 === 80 && r.x1 === 899)).toBe(true);
    expect(v.map((r) => r.x0)).toEqual([80.5, 400.5, 898.5]);
    expect(rules[0].width).toBe(2);
  });

  it("bridges the small breaks a scan leaves in a line", () => {
    const p = page(1000, 400);
    p.rect(50, 100, 450, 102);
    p.rect(453, 100, 950, 102);
    expect(rulesOf(p.g, 14).filter((r) => r.y0 === r.y1)).toHaveLength(1);
  });

  it("finds grey lines too, as printers and phones produce", () => {
    const p = page(1000, 400);
    p.rect(50, 100, 950, 102, 165);
    expect(rulesOf(p.g, 14)).toHaveLength(1);
  });
});

describe("inkBox", () => {
  it("is the area the marks are in, without stray specks", () => {
    const p = page(600, 600);
    p.rect(200, 150, 400, 160);
    p.rect(210, 400, 380, 420);
    p.rect(5, 5, 6, 6);
    expect(inkBox(p.g)).toEqual([200, 150, 400, 420]);
  });

  it("is the whole page when it is blank", () => {
    expect(inkBox(page(100, 80).g)).toEqual([0, 0, 100, 80]);
  });
});

describe("lighting", () => {
  /** Paper darkening from 250 at the left to `dark` at the right, with dark marks on it. */
  const shaded = (dark: number) => {
    const p = page(800, 600);
    for (let y = 0; y < 600; y++) for (let x = 0; x < 800; x++) p.data[y * 800 + x] = Math.round(250 - ((250 - dark) * x) / 800);
    for (let y = 60; y < 540; y += 40) p.rect(80, y, 720, y + 12, 15);
    return p.g;
  };

  it("measures how uneven the light is", () => {
    expect(unevenLight(page(800, 600).g)).toBeLessThan(0.02);
    expect(unevenLight(shaded(140))).toBeGreaterThan(0.3);
  });

  it("brings the paper to an even light grey and keeps the ink dark", () => {
    const g = evenLight(shaded(130));
    const paperAt = (x: number) => g.data[10 * 800 + x];
    expect(Math.abs(paperAt(30) - paperAt(770))).toBeLessThan(12);
    expect(paperAt(30)).toBeGreaterThan(220);
    // Ink inside the shaded part is still much darker than the paper beside it.
    expect(g.data[66 * 800 + 700]).toBeLessThan(60);
  });
});

/** An OCR line of words at a baseline: [text, x0, x1]. */
const line = (y: number, words: [string, number, number][], height = 20): OcrLine => ({
  baseline: { x0: words[0][1], y0: y, x1: words[words.length - 1][2], y1: y, has_baseline: true },
  words: words.map(([text, x0, x1]) => ({ text, confidence: 92, bbox: { x0, y0: y - height, x1, y1: y + 4 } })),
});
const ocrPage = (lines: OcrLine[]): OcrPage => ({ lines, confidence: 92 });

describe("pageFromOcr", () => {
  it("measures the text height from how far words rise above their baseline", () => {
    expect(textHeightOf(ocrPage([line(100, [["Valve", 10, 80]])]))).toBe(20);
  });

  it("puts words close together into one cell and keeps cells far apart separate", () => {
    const out = pageFromOcr(
      ocrPage([
        line(100, [
          ["Ball", 100, 150],
          ["Valve", 160, 220],
          ["450.00", 600, 680],
        ]),
      ]),
    );
    expect(out.pieces.map((p) => p.str)).toEqual(["Ball Valve", "450.00"]);
    // Scaled so that the text is about 9 high.
    expect(out.pieces[0].h).toBeCloseTo(9, 0);
  });

  it("does not join words across a vertical border, and drops stray marks", () => {
    const rules = [
      { x0: 160, y0: 0, x1: 160, y1: 500 },
      { x0: 400, y0: 0, x1: 400, y1: 500 },
      { x0: 700, y0: 0, x1: 700, y1: 500 },
    ];
    const lines = [
      line(100, [
        ["15", 100, 130],
        ["|", 150, 156],
        ["mm", 170, 215],
        ["rrr", 230, 900],
      ]),
      line(160, [
        ["Tap", 100, 140],
        ["8.5", 300, 330],
      ]),
    ];
    const out = pageFromOcr(ocrPage(lines), rules);
    expect(out.pieces.map((p) => p.str)).toEqual(["15", "mm", "Tap", "8.5"]);
    expect(out.rules).toHaveLength(3);
  });

  it("uses the scale it is given, so that all pages of a document share one", () => {
    const out = pageFromOcr(ocrPage([line(200, [["Tap", 100, 140]])]), [], 0.5);
    expect(out.pieces[0]).toMatchObject({ x: 50, y: 100, w: 20 });
  });

  it("builds a table from words and borders", () => {
    const rule = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });
    const rules = [rule(80, 60, 700, 60), rule(80, 130, 700, 130), rule(80, 200, 700, 200), rule(80, 270, 700, 270), rule(80, 60, 80, 270), rule(380, 60, 380, 270), rule(700, 60, 700, 270)];
    const lines = [
      line(100, [
        ["Item", 100, 160],
        ["MRP", 420, 480],
      ]),
      line(170, [
        ["Ball", 100, 150],
        ["Valve", 160, 220],
        ["450.00", 420, 500],
      ]),
      line(240, [
        ["Gate", 100, 150],
        ["Valve", 160, 220],
        ["610.00", 420, 500],
      ]),
    ];
    expect(tablesFromPages([pageFromOcr(ocrPage(lines), rules)])[0].rows).toEqual([
      ["Item", "MRP"],
      ["Ball Valve", "450.00"],
      ["Gate Valve", "610.00"],
    ]);
  });
});

describe("betterNumber", () => {
  it("prefers the reading that kept the decimal point when the digits agree", () => {
    expect(betterNumber("108", 90, "10.8", 70)).toBe(true);
    expect(betterNumber("10.8", 70, "108", 95)).toBe(false);
    expect(betterNumber("1,290", 80, "1290", 99)).toBe(false);
    expect(betterNumber("115", 74, "115", 99)).toBe(false);
  });

  it("takes a different reading of the digits unless the engine is clearly less sure of it", () => {
    expect(betterNumber("17", 60, "11", 62)).toBe(true);
    expect(betterNumber("17", 90, "11", 70)).toBe(false);
  });
});

describe("lining up scanned pages", () => {
  it("finds where a page's table starts and moves the page", () => {
    const p = {
      pieces: [{ x: 40, y: 10, w: 20, h: 9, str: "A" }],
      rules: [
        { x0: 30, y0: 0, x1: 30, y1: 100 },
        { x0: 200, y0: 0, x1: 200, y1: 100 },
        { x0: 30, y0: 0, x1: 200, y1: 0 },
      ],
    };
    expect(leftEdge(p)).toBe(30);
    expect(leftEdge({ pieces: p.pieces })).toBe(40);
    const moved = shifted(p, 6);
    expect(moved.pieces[0].x).toBe(46);
    expect(moved.rules?.map((r) => [r.x0, r.x1])).toEqual([
      [36, 36],
      [206, 206],
      [36, 206],
    ]);
    expect(shifted(p, 0)).toBe(p);
  });
});
