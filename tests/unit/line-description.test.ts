import { describe, expect, it } from "vitest";
import { lineDescription } from "@/lib/line-description";

describe("lineDescription", () => {
  it("prefixes the brand when the product name does not include it", () => {
    expect(lineDescription("Berger", "SAMPLE Interior Emulsion", "White · 4 L")).toBe("Berger SAMPLE Interior Emulsion — White · 4 L");
  });

  it("does not repeat a brand the product name already starts with", () => {
    expect(lineDescription("Plumber", "Plumber Pillar Cock EC-0104", "Chrome")).toBe("Plumber Pillar Cock EC-0104 — Chrome");
    expect(lineDescription("Truflo by Hindware", "TRUFLO BY HINDWARE CPVC Tee", null)).toBe("TRUFLO BY HINDWARE CPVC Tee");
  });

  it("only matches the brand as a whole word", () => {
    expect(lineDescription("AGL", "AGLow Lamp", null)).toBe("AGL AGLow Lamp");
  });

  it("drops the Standard placeholder option but keeps real options", () => {
    expect(lineDescription("Blues", "Blues AC-21 Bib Cock", "Standard")).toBe("Blues AC-21 Bib Cock");
    expect(lineDescription(null, "Teflon tape", "12 mm")).toBe("Teflon tape — 12 mm");
  });
});
