import { describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { brands, products, productVariants, variantPrices } from "@/server/db/schema";
import { commitImport, IMPORT_COLUMNS, validateImport } from "@/server/services/import";
import { makeUser, uid } from "./helpers";

type Row = Partial<Record<(typeof IMPORT_COLUMNS)[number], string>>;
const csv = (rows: Row[]) =>
  [IMPORT_COLUMNS.join(","), ...rows.map((r) => IMPORT_COLUMNS.map((c) => (/[",\n]/.test(r[c] ?? "") ? `"${(r[c] ?? "").replace(/"/g, '""')}"` : (r[c] ?? ""))).join(","))].join("\n");

// Sizes avoid "20": the public search test looks for it among published products.
function sheet(tag: string, extra: Row = {}): Row[] {
  const base = { category: "cpvc-pipes-fittings", brand: `Brand ${tag}`, gst_rate: "18", hsn_code: "3917", unit: "pcs", price_includes_tax: "yes" };
  return [
    { ...base, product_name: `Valve ${tag}`, sku: `${tag}-15`, variant_name: "15 mm", variant_attributes: "Size=15 mm", mrp: "210", selling_price: "180", ...extra },
    { ...base, product_name: `Valve ${tag}`, sku: `${tag}-25`, variant_name: "25 mm", variant_attributes: "Size=25 mm", mrp: "250", selling_price: "215.25" },
    { ...base, product_name: `Elbow ${tag}`, sku: `${tag}-E`, variant_name: "Standard", selling_price: "12" },
  ];
}

async function importedProducts(tag: string) {
  const db = getDb();
  const vs = await db.select().from(productVariants).where(inArray(productVariants.sku, [`${tag}-15`, `${tag}-25`, `${tag}-E`]));
  const ps = await db.select().from(products).where(inArray(products.id, [...new Set(vs.map((v) => v.productId))]));
  const prices = await db.select().from(variantPrices).where(inArray(variantPrices.variantId, vs.map((v) => v.id)));
  return { vs, ps, prices };
}

describe("bulk import", () => {
  it("creates products with their variants and prices as drafts by default", async () => {
    const owner = await makeUser("super_admin");
    const tag = uid("IMP").toUpperCase();
    const r = await commitImport(owner, csv(sheet(tag)));
    expect(r).toMatchObject({ createdProducts: 2, createdVariants: 3, published: false, images: { stored: 0, failed: [] } });
    const { vs, ps, prices } = await importedProducts(tag);
    expect(vs).toHaveLength(3);
    expect(ps.every((p) => !p.isPublished && p.reviewStatus === "draft")).toBe(true);
    expect(prices.map((p) => [p.price, p.status]).sort()).toEqual([["12.00", "approved"], ["180.00", "approved"], ["215.25", "approved"]]);
  });

  it("publishes straight away when asked by someone allowed to publish", async () => {
    const admin = await makeUser("admin");
    const tag = uid("PUB").toUpperCase();
    const r = await commitImport(admin, csv(sheet(tag)), { publish: true });
    expect(r.published).toBe(true);
    const { ps } = await importedProducts(tag);
    expect(ps).toHaveLength(2);
    expect(ps.every((p) => p.isPublished && p.reviewStatus === "approved")).toBe(true);
  });

  it("reports a photo link it may not fetch without undoing the import", async () => {
    const owner = await makeUser("super_admin");
    const tag = uid("IMG").toUpperCase();
    const r = await commitImport(owner, csv(sheet(tag, { image_url: "http://127.0.0.1:9/photo.png" })));
    expect(r.createdProducts).toBe(2);
    expect(r.images.stored).toBe(0);
    expect(r.images.failed).toEqual([{ product: `Valve ${tag}`, url: "http://127.0.0.1:9/photo.png", reason: "not a public internet address" }]);
    const [p] = await getDb().select().from(products).where(eq(products.name, `Valve ${tag}`));
    expect(p).toBeDefined();
  });

  it("checks photo links before importing", async () => {
    const owner = await makeUser("super_admin");
    const tag = uid("BAD").toUpperCase();
    const report = await validateImport(owner, csv(sheet(tag, { image_url: "photo.png https://a.example/1.jpg https://a.example/2.jpg https://a.example/3.jpg https://a.example/4.jpg" })));
    expect(report.errorCount).toBe(1);
    expect(report.rows[0].messages).toEqual(expect.arrayContaining([expect.stringMatching(/at most 4 photos/), expect.stringMatching(/"photo.png" is not a web address/)]));
    const ok = await validateImport(owner, csv(sheet(tag, { image_url: "https://a.example/1.jpg; https://a.example/2.jpg" })));
    expect(ok.errorCount).toBe(0);
    expect(ok.photoCount).toBe(2);
  });

  it("imports Hindi and Gujarati names, giving each product and brand its own page address", async () => {
    const owner = await makeUser("super_admin");
    const tag = uid("IND").toUpperCase();
    const base = { category: "cpvc-pipes-fittings", gst_rate: "18", hsn_code: "3917", unit: "pcs", price_includes_tax: "yes", mrp: "210", selling_price: "180" };
    const rows: Row[] = [
      { ...base, brand: "चौधरी पाइप्स", product_name: "सीपीवीसी एल्बो 90°", sku: `${tag}-H1`, variant_name: "15 मिमी", variant_attributes: "Size=15 मिमी" },
      { ...base, brand: "चौधरी पाइप्स", product_name: "सीपीवीसी एल्बो 90°", sku: `${tag}-H2`, variant_name: "20 मिमी", variant_attributes: "Size=20 मिमी" },
      { ...base, brand: "चौधरी पाइप्स", product_name: "सीपीवीसी टी", sku: `${tag}-H3`, variant_name: "15 मिमी" },
      { ...base, brand: "ચૌધરી પાઇપ્સ", product_name: "સીપીવીસી એલ્બો 90°", sku: `${tag}-G1`, variant_name: "15 મીમી" },
      { ...base, brand: "ચૌધરી પાઇપ્સ", product_name: "સીપીવીસી ટી", sku: `${tag}-G2`, variant_name: "15 મીમી" },
    ];
    const report = await validateImport(owner, csv(rows));
    expect(report.errorCount).toBe(0);
    const r = await commitImport(owner, csv(rows));
    expect(r).toMatchObject({ createdProducts: 4, createdVariants: 5 });

    const db = getDb();
    const vs = await db.select().from(productVariants).where(inArray(productVariants.sku, rows.map((x) => x.sku!)));
    const ps = await db.select().from(products).where(inArray(products.id, [...new Set(vs.map((v) => v.productId))]));
    expect(ps.map((p) => p.name).sort()).toEqual(["સીપીવીસી એલ્બો 90°", "સીપીવીસી ટી", "सीपीवीसी एल्बो 90°", "सीपीवीसी टी"].sort());
    // Every product has an address of Latin letters and digits, and no two are the same.
    expect(ps.every((p) => /^[a-z0-9][a-z0-9-]*$/.test(p.slug))).toBe(true);
    expect(new Set(ps.map((p) => p.slug)).size).toBe(4);
    // The 15 mm and 20 mm elbows are one product with two variants.
    const elbow = ps.find((p) => p.name === "सीपीवीसी एल्बो 90°")!;
    expect(vs.filter((v) => v.productId === elbow.id).map((v) => v.name).sort()).toEqual(["15 मिमी", "20 मिमी"]);
    const bs = await db.select().from(brands).where(inArray(brands.name, ["चौधरी पाइप्स", "ચૌધરી પાઇપ્સ"]));
    expect(bs).toHaveLength(2);
    expect(bs.every((b) => /^brand-[a-z0-9]+$/.test(b.slug))).toBe(true);
    expect(new Set(bs.map((b) => b.slug)).size).toBe(2);
  });
});
