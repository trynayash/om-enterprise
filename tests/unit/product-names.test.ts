import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { drawingKind } from "@/components/public/technical-drawing";
import { KeepCodes } from "@/components/public/keep-codes";

describe("drawingKind", () => {
  it("draws angular stop cocks and angle valves as angle cocks", () => {
    expect(drawingKind("Aris Angular Stop Cock with Wall Flange MFLT-105 (Mini Florentine)", "bath")).toBe("angle");
    expect(drawingKind("Aris 2-Way Angular Stop Cock with Wall Flange MFLT-106", "bath")).toBe("angle");
    expect(drawingKind("Blues AC-27 Angle Valve (Ace Collection)", "bath")).toBe("angle");
    expect(drawingKind("Plumber Angle Cock EC-0507 (Economy)", "bath")).toBe("angle");
  });

  it("keeps other valves and taps as before", () => {
    expect(drawingKind("Finolex CPVC Ball Valve", "pipe")).toBe("valve");
    expect(drawingKind("Aris Bib Cock with Wall Flange MFLT-101", "bath")).toBe("tap");
    expect(drawingKind("Aris Pillar Cock MFLT-103", "bath")).toBe("pillar");
  });
});

describe("KeepCodes", () => {
  const html = (text: string) => renderToStaticMarkup(createElement(KeepCodes, { text }));

  it("keeps model codes on one line", () => {
    expect(html("Aris Bib Cock MFLT-101 (Mini Florentine)")).toBe(
      'Aris Bib Cock <span class="whitespace-nowrap">MFLT-101</span> (Mini Florentine)',
    );
    expect(html("2-Way Bib Cock EC-0209")).toBe(
      '<span class="whitespace-nowrap">2-Way</span> Bib Cock <span class="whitespace-nowrap">EC-0209</span>',
    );
  });

  it("leaves names without codes, and hyphenated words, untouched", () => {
    expect(html("Wall Mixer Non-Telephonic Shower System")).toBe("Wall Mixer Non-Telephonic Shower System");
    expect(html("Berger Silk Glamor")).toBe("Berger Silk Glamor");
  });
});
