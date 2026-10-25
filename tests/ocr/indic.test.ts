import { describe, expect, it } from "vitest";
import { readFixture, importRowsOf } from "./helpers";

/**
 * Hindi and Gujarati scans, read with the real engine: a flat scan of a Hindi price list and a
 * phone-style photo (tilted 1°, darker toward one side) of the same list in Gujarati. Both are the
 * invented list "Choudhary Pipes": 12 CPVC fittings with item codes, an MRP and a dealer rate.
 * What comes out must have every code, name and price of the list.
 */
/** The three sizes of each product: [name in Hindi, name in Gujarati, [size, MRP, dealer rate] for 15, 20 and 25 mm]. */
const PRODUCTS: [string, string, string, [string, string][]][] = [
  [
    "101",
    "सीपीवीसी एल्बो 90°",
    "સીપીવીસી એલ્બો 90°",
    [
      ["8", "5.76"],
      ["14.75", "10.62"],
      ["20.5", "14.76"],
    ],
  ],
  [
    "111",
    "सीपीवीसी टी",
    "સીપીવીસી ટી",
    [
      ["12", "8.64"],
      ["17.75", "12.78"],
      ["24.5", "17.64"],
    ],
  ],
  [
    "121",
    "सीपीवीसी कपलर",
    "સીપીવીસી કપ્લર",
    [
      ["15", "10.8"],
      ["21.75", "15.66"],
      ["27.5", "19.8"],
    ],
  ],
  [
    "131",
    "बॉल वाल्व (ब्रास)",
    "બોલ વાલ્વ (બ્રાસ)",
    [
      ["19", "13.68"],
      ["24.75", "17.82"],
      ["31.5", "22.68"],
    ],
  ],
];
const SIZES = ["15", "20", "25"];

/** The rows the scans must give: `prefix` of the codes, the unit word after the size, and the language of the names. */
const truth = (prefix: "CH" | "GJ", mm: string, language: "hi" | "gu") =>
  PRODUCTS.flatMap(([first, hi, gu, prices]) =>
    prices.map(([mrp, dealer], i) => ({ sku: `${prefix}-${Number(first) + i}`, name: language === "hi" ? hi : gu, size: `${SIZES[i]} ${mm}`, mrp, dealer })),
  );

function compare(got: ReturnType<typeof importRowsOf>["rows"], want: ReturnType<typeof truth>) {
  const bySku = new Map(got.map((r) => [r.sku, r]));
  const missing = want.filter((w) => !bySku.has(w.sku)).map((w) => w.sku);
  const wrong: string[] = [];
  for (const w of want) {
    const r = bySku.get(w.sku);
    if (!r) continue;
    const bad = [
      r.mrp !== w.mrp && `mrp ${r.mrp} ≠ ${w.mrp}`,
      r.purchase_cost !== w.dealer && `rate ${r.purchase_cost} ≠ ${w.dealer}`,
      r.product_name !== w.name && `name ${r.product_name} ≠ ${w.name}`,
      r.variant_name !== w.size && `size ${r.variant_name} ≠ ${w.size}`,
    ].filter(Boolean);
    if (bad.length) wrong.push(`${w.sku}: ${bad.join(", ")}`);
  }
  return { missing, wrong };
}

describe("Hindi and Gujarati scans", () => {
  it("a flat scan of a Hindi price list is read: codes, names, sizes and prices", async () => {
    const read = await readFixture("scan-hindi.jpg", { languages: ["eng", "hin"] });
    expect(read).toMatchObject({ kind: "picture", scanned: true });
    const got = importRowsOf(read.tables);
    // The Hindi headings are matched to the fields.
    expect(got.columns).toMatchObject({ sku: 1, product_name: 2, variant: 3, mrp: 4, purchase_cost: 5, gst_rate: 6 });
    const { missing, wrong } = compare(got.rows, truth("CH", "मिमी", "hi"));
    expect(got.rows).toHaveLength(12);
    expect(missing).toEqual([]);
    expect(wrong, wrong.join("\n")).toEqual([]);
  });

  it("a tilted, unevenly lit photo of a Gujarati price list is read: codes, names, sizes and prices", async () => {
    const read = await readFixture("scan-gujarati.jpg", { languages: ["eng", "guj"] });
    expect(read).toMatchObject({ kind: "picture", scanned: true });
    const got = importRowsOf(read.tables);
    expect(got.columns).toMatchObject({ sku: 1, product_name: 2, variant: 3, mrp: 4, purchase_cost: 5, gst_rate: 6 });
    const { missing, wrong } = compare(got.rows, truth("GJ", "મીમી", "gu"));
    expect(got.rows).toHaveLength(12);
    expect(missing).toEqual([]);
    expect(wrong, wrong.join("\n")).toEqual([]);
  });

  it("with all three languages chosen, the same scan still gives every price and code", async () => {
    const read = await readFixture("scan-hindi.jpg", { languages: ["eng", "hin", "guj"] });
    const got = importRowsOf(read.tables);
    const { missing, wrong } = compare(got.rows, truth("CH", "मिमी", "hi"));
    expect(missing).toEqual([]);
    // Names may differ in a letter here; the prices are what must be right.
    expect(
      wrong.filter((w) => /mrp|rate/.test(w)),
      wrong.join("\n"),
    ).toEqual([]);
  });

  it("English alone cannot read Hindi: the codes and prices come out, the Hindi does not", async () => {
    const read = await readFixture("scan-hindi.jpg");
    const text = read.tables[0].rows.flat().join(" ");
    // This is why the page lets the person choose the language.
    expect(text.match(/[\u0900-\u097F]/g) ?? []).toHaveLength(0);
    expect(text).toContain("CH-101");
    expect(text).toContain("14.75");
  });
});
