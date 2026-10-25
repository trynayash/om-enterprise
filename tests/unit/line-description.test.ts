import { describe, expect, it } from "vitest";
import { lineDescription, optionLabel } from "@/lib/line-description";

describe("lineDescription", () => {
  it("puts the brand in front of a product name that does not carry it", () => {
    expect(lineDescription("Finolex", "CPVC Elbow 90°", "20 mm")).toBe("Finolex CPVC Elbow 90° — 20 mm");
  });

  it("leaves the brand out when the product name already starts with it", () => {
    expect(lineDescription("Plumber", "Plumber Pillar Cock EC-0101", null)).toBe("Plumber Pillar Cock EC-0101");
    expect(lineDescription("Umiya Gold", "Umiya Gold 7 Layer Water Tank", "500 L")).toBe("Umiya Gold 7 Layer Water Tank — 500 L");
  });

  it("leaves the brand out when the name starts with the brand's first word", () => {
    expect(lineDescription("Truflo by Hindware", "Truflo CPVC Elbow 90° Plain", '20 mm (¾")')).toBe('Truflo CPVC Elbow 90° Plain — 20 mm (¾")');
    expect(lineDescription("Berger Paints", "Berger Weathercoat", "4 L")).toBe("Berger Weathercoat — 4 L");
  });

  it("does not take a short or partial first word for the brand", () => {
    expect(lineDescription("Om Gold", "Omega Pipe", null)).toBe("Om Gold Omega Pipe");
    expect(lineDescription("A One", "Alpha Tap", null)).toBe("A One Alpha Tap");
    expect(lineDescription("Astral", "Astro Fitting", null)).toBe("Astral Astro Fitting");
  });

  it("drops the 'Standard' placeholder option and handles a missing brand", () => {
    expect(lineDescription(null, "Solvent Cement", "Standard")).toBe("Solvent Cement");
    expect(lineDescription(null, "Solvent Cement", " standard ")).toBe("Solvent Cement");
    expect(lineDescription(null, "Solvent Cement", "118 ml")).toBe("Solvent Cement — 118 ml");
    expect(optionLabel(null)).toBeNull();
  });
});
