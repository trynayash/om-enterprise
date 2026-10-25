import { describe, expect, it } from "vitest";
import { tablesFromPages, type PageText, type TextPiece } from "@/lib/import-files/layout";
import { piecesFromOperators, type OpCodes } from "@/lib/import-files/pdf-ops";

const OPS: OpCodes = {
  save: 10,
  restore: 11,
  transform: 12,
  beginText: 31,
  setCharSpacing: 33,
  setWordSpacing: 34,
  setHScale: 35,
  setLeading: 36,
  setFont: 37,
  setTextRise: 39,
  moveText: 40,
  setLeadingMoveText: 41,
  setTextMatrix: 42,
  nextLine: 43,
  showText: 44,
  showSpacedText: 45,
  nextLineShowText: 46,
  nextLineSetSpacingShowText: 47,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  beginGroup: 76,
  endGroup: 77,
  clip: 29,
  eoClip: 30,
  constructPath: 91,
  stroke: 20,
  closeStroke: 21,
  fill: 22,
  eoFill: 23,
  fillStroke: 24,
  eoFillStroke: 25,
  closeFillStroke: 26,
  closeEOFillStroke: 27,
};
/** A4 page, top-left origin. */
const VIEWPORT = [1, 0, 0, -1, 0, 842];
const font = { fontMatrix: [0.001, 0, 0, 0.001, 0, 0] };
/** Glyphs 500 units wide: 5 points at 10 pt. */
const glyphs = (s: string) => [...s].map((c) => ({ unicode: c, width: 500, isSpace: c === " " }));

function run(ops: [number, unknown[]][]) {
  return piecesFromOperators(
    ops.map(([fn]) => fn),
    ops.map(([, args]) => args),
    OPS,
    VIEWPORT,
    () => font,
  );
}
const text = (x: number, y: number, content: unknown[]): [number, unknown[]][] => [
  [OPS.beginText, []],
  [OPS.setFont, ["f1", 10]],
  [OPS.setTextMatrix, [[1, 0, 0, 1, x, 842 - y]]],
  [OPS.showText, [content]],
];

describe("piecesFromOperators", () => {
  it("keeps every text operation separate, with its position and width", () => {
    const { pieces } = run([...text(88, 140, glyphs("1")), ...text(94, 140, glyphs("TL-011"))]);
    expect(pieces).toEqual([
      { x: 88, y: 140, w: 5, h: 10, str: "1" },
      { x: 94, y: 140, w: 30, h: 10, str: "TL-011" },
    ]);
  });

  it("splits one operation at wide jumps and two spaces, and keeps word spaces", () => {
    const { pieces } = run(text(50, 100, [...glyphs("Tap"), -3000, ...glyphs("450"), -200, ...glyphs("00"), ...glyphs("  pcs")]));
    expect(pieces.map((p) => [p.str, p.x])).toEqual([
      ["Tap", 50],
      ["450 00", 95],
      ["pcs", 132],
    ]);
  });

  it("treats a letter on character code 32 as a letter (subset fonts), with word spacing", () => {
    const l = { unicode: "l", width: 500, isSpace: true };
    const { pieces } = run([[OPS.setWordSpacing, [2]], ...text(10, 50, [...glyphs("E"), l, ...glyphs("bow")])]);
    expect(pieces).toEqual([{ x: 10, y: 50, w: 27, h: 10, str: "Elbow" }]);
  });

  it("trims text to its cell's clip and marks the cut", () => {
    const { pieces } = run([
      [OPS.save, []],
      [OPS.eoClip, []],
      [OPS.constructPath, [28, [], [90, 0, 120, 842]]],
      ...text(94, 120, glyphs("Item Code")),
      [OPS.restore, []],
      ...text(130, 120, glyphs("Description")),
    ]);
    expect(pieces).toEqual([
      { x: 94, y: 120, w: 26, h: 10, str: "Item Code", cut: true },
      { x: 130, y: 120, w: 55, h: 10, str: "Description" },
    ]);
  });

  it("collects table borders: stroked lines, thin bars and filled boxes", () => {
    const { rules } = run([
      [OPS.constructPath, [OPS.stroke, [new Float32Array([0, 40, 742, 1, 400, 742])], null]],
      [OPS.constructPath, [OPS.fill, [new Float32Array([0, 100, 700, 1, 100.5, 700, 1, 100.5, 760, 1, 100, 760, 4])], null]],
      [OPS.constructPath, [OPS.fill, [new Float32Array([0, 40, 500, 1, 400, 500, 1, 400, 520, 1, 40, 520, 4])], null]],
      [OPS.constructPath, [OPS.stroke, [new Float32Array([0, 10, 10, 2, 20, 20, 30, 30, 40, 10])], null]],
    ]);
    expect(rules).toEqual([
      { x0: 40, y0: 100, x1: 400, y1: 100 },
      { x0: 100.25, y0: 82, x1: 100.25, y1: 142 },
      { x0: 40, y0: 322, x1: 400, y1: 322 },
      { x0: 40, y0: 342, x1: 400, y1: 342 },
      { x0: 40, y0: 322, x1: 40, y1: 342 },
      { x0: 400, y0: 322, x1: 400, y1: 342 },
    ]);
  });

  it("follows the graphics state: transforms, saved states and forms", () => {
    const { pieces } = run([
      [OPS.save, []],
      [OPS.transform, [2, 0, 0, 2, 0, 0]],
      ...text(10, 421, glyphs("Big")),
      [OPS.restore, []],
      [OPS.paintFormXObjectBegin, [[1, 0, 0, 1, 100, 0], null]],
      ...text(0, 400, glyphs("Form")),
      [OPS.paintFormXObjectEnd, []],
      ...text(0, 380, glyphs("Page")),
    ]);
    expect(pieces.map((p) => [p.str, p.x, p.y, p.w, p.h])).toEqual([
      ["Big", 20, 0, 30, 20],
      ["Form", 100, 400, 20, 10],
      ["Page", 0, 380, 20, 10],
    ]);
  });

  it("counts text that runs sideways instead of reading it as a line", () => {
    const out = run([
      [OPS.beginText, []],
      [OPS.setFont, ["f1", 10]],
      [OPS.setTextMatrix, [[0, 1, -1, 0, 300, 300]]],
      [OPS.showText, [glyphs("Up")]],
    ]);
    expect(out.pieces).toEqual([]);
    expect(out.sideways).toBe(1);
  });
});

/** Text runs laid out like a page: [x, y, text] with a 9 pt font and 5 pt per character. */
const page = (items: [number, number, string][], rules: PageText["rules"] = []): PageText => ({
  pieces: items.map(([x, y, str]): TextPiece => ({ x, y, w: str.length * 5, h: 9, str })),
  rules,
});
const rows = (p: PageText) => tablesFromPages([p])[0].rows;

describe("tablesFromPages", () => {
  it("puts a heading over right-aligned numbers, and text and numbers aligned apart, in one column", () => {
    const items: [number, number, string][] = [
      [50, 100, "Sr. No"],
      [100, 100, "Code"],
      [200, 100, "GST %"],
    ];
    for (let i = 0; i < 6; i++) {
      const y = 112 + i * 12;
      items.push([i < 3 ? 85 : 80, y, String(i < 3 ? i + 1 : 10 + i)], [100, y, `TL-0${i}`], i % 2 ? [217, y, "0.18"] : [200, y, "18%"]);
    }
    expect(rows(page(items))).toEqual([
      ["Sr. No", "Code", "GST %"],
      ["1", "TL-00", "18%"],
      ["2", "TL-01", "0.18"],
      ["3", "TL-02", "18%"],
      ["13", "TL-03", "0.18"],
      ["14", "TL-04", "18%"],
      ["15", "TL-05", "0.18"],
    ]);
  });

  it("does not join a cell cut off at its edge to the next cell", () => {
    const p = page([
      [50, 100, "Item Code"],
      [95, 100, "Description"],
      [50, 112, "A-1"],
      [95, 112, "Tap"],
    ]);
    p.pieces[0] = { ...p.pieces[0], w: 44.5, cut: true };
    expect(rows(p)).toEqual([
      ["Item Code", "Description"],
      ["A-1", "Tap"],
    ]);
  });

  it("joins the lines between two borders into one row, and the words inside one bordered cell", () => {
    const h = (y: number) => ({ x0: 40, y0: y, x1: 300, y1: y });
    const v = (x: number) => ({ x0: x, y0: 90, x1: x, y1: 166 });
    const p = page(
      [
        [50, 100, "Item"],
        [150, 100, "MRP"],
        [50, 115, "Ball"],
        [75, 115, "Valve"],
        [150, 121, "450"],
        [50, 127, "Brass"],
        [50, 142, "Gate"],
        [75, 142, "Valve"],
        [150, 142, "610"],
        [50, 157, "Pipe"],
        [150, 157, "90"],
      ],
      [h(90), h(105), h(133), h(148), h(163), v(40), v(140), v(300)],
    );
    expect(rows(p)).toEqual([
      ["Item", "MRP"],
      ["Ball Valve Brass", "450"],
      ["Gate Valve", "610"],
      ["Pipe", "90"],
    ]);
  });

  it("without borders, joins wrapped cells to their row by the spacing, whichever way they are aligned", () => {
    const p = page([
      [50, 100, "Code"],
      [100, 100, "MRP"],
      [150, 100, "Remarks"],
      // Bottom-aligned: the wrapped text comes first.
      [150, 130, "Pack of 25,"],
      [150, 141, "ISI marked"],
      [50, 152, "A-1"],
      [100, 152, "450"],
      [150, 152, "item 1"],
      [150, 182, "Pack of 50,"],
      [150, 193, "ISI marked"],
      [50, 204, "A-2"],
      [100, 204, "610"],
      [150, 204, "item 2"],
    ]);
    expect(rows(p)).toEqual([
      ["Code", "MRP", "Remarks"],
      ["A-1", "450", "Pack of 25, ISI marked item 1"],
      ["A-2", "610", "Pack of 50, ISI marked item 2"],
    ]);
  });

  it("keeps closely set single-line rows apart", () => {
    const items: [number, number, string][] = [];
    for (let i = 0; i < 5; i++) items.push([50, 100 + i * 11, `A-${i}`], [100, 100 + i * 11, "Tap"], [150, 100 + i * 11, String(100 + i)]);
    expect(rows(page(items))).toHaveLength(5);
  });

  it("joins a wrapped name tucked under its row when rows are spaced further apart", () => {
    const items: [number, number, string][] = [];
    for (let i = 0; i < 5; i++) {
      const y = 100 + i * 30;
      items.push([50, y, `A-${i}`], [100, y, "Ball valve"], [180, y, String(100 + i)]);
      if (i === 2) items.push([100, y + 10, "full bore"]);
    }
    expect(rows(page(items))[2]).toEqual(["A-2", "Ball valve full bore", "102"]);
  });

  it("reads a two-page table as one, plus each page", () => {
    const one = page([
      [50, 100, "Code"],
      [100, 100, "MRP"],
      [50, 112, "A-1"],
      [100, 112, "450"],
    ]);
    const two = page([
      [50, 100, "A-2"],
      [100, 100, "610"],
    ]);
    const tables = tablesFromPages([one, two]);
    expect(tables.map((t) => t.name)).toEqual(["All pages", "Page 1", "Page 2"]);
    expect(tables[0].rows).toEqual([
      ["Code", "MRP"],
      ["A-1", "450"],
      ["A-2", "610"],
    ]);
  });
});
