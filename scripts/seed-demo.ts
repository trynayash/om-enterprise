/**
 * Load SAMPLE / DEMONSTRATION catalogue data for training and testing.
 *
 *   npm run seed:demo
 *
 * Every product is flagged `is_sample`, named "SAMPLE …", shown with a SAMPLE badge everywhere,
 * and any sale containing one is a TRAINING sale (separate "TRN/" numbering, watermarked,
 * excluded from reports). Prices and costs are placeholders — NOT real manufacturer data.
 * Requires an existing Super Admin (run `npm run create-super-admin` first); actions are
 * audited under that account.
 */
import "dotenv/config";

type Variant = {
  sku: string;
  name: string;
  attrs: Record<string, string>;
  price: string;
  cost?: string;
  mrp?: string;
  tiers?: { minQty: string; price: string }[];
};
type Item = {
  category: string;
  brand?: string;
  name: string;
  unit: string;
  hsn: string;
  gst: string;
  attrs: string[];
  specs: { label: string; value: string }[];
  variants: Variant[];
  featured?: boolean;
  altUnit?: { unit: string; factor: string };
};

const SAMPLE_NOTE =
  "SAMPLE DATA for staff training and website preview. Not real product information — replace with details from the official catalogue / data sheet before publishing real products.";

const ITEMS: Item[] = [
  {
    category: "berger-paints",
    brand: "Berger",
    name: "SAMPLE Interior Emulsion",
    unit: "pcs",
    hsn: "3209",
    gst: "18",
    attrs: ["Colour", "Pack size"],
    specs: [{ label: "Finish", value: "Sample value" }, { label: "Data source", value: "Demonstration only" }],
    featured: true,
    variants: [
      { sku: "DEMO-PNT-INT-1L", name: "White · 1 L", attrs: { Colour: "White", "Pack size": "1 L" }, price: "350.00", cost: "240.00" },
      { sku: "DEMO-PNT-INT-4L", name: "White · 4 L", attrs: { Colour: "White", "Pack size": "4 L" }, price: "1290.00", cost: "900.00" },
      { sku: "DEMO-PNT-INT-10L", name: "White · 10 L", attrs: { Colour: "White", "Pack size": "10 L" }, price: "3050.00", cost: "2150.00" },
      { sku: "DEMO-PNT-INT-20L", name: "White · 20 L", attrs: { Colour: "White", "Pack size": "20 L" }, price: "5900.00", cost: "4200.00" },
    ],
  },
  {
    category: "berger-paints",
    brand: "Berger",
    name: "SAMPLE Exterior Emulsion",
    unit: "pcs",
    hsn: "3209",
    gst: "18",
    attrs: ["Colour", "Pack size"],
    specs: [{ label: "Data source", value: "Demonstration only" }],
    variants: [
      { sku: "DEMO-PNT-EXT-4L", name: "Off-white · 4 L", attrs: { Colour: "Off-white", "Pack size": "4 L" }, price: "1650.00", cost: "1180.00" },
      { sku: "DEMO-PNT-EXT-20L", name: "Off-white · 20 L", attrs: { Colour: "Off-white", "Pack size": "20 L" }, price: "7600.00" },
    ],
  },
  {
    category: "umiya-gold-water-tanks",
    brand: "Umiya Gold",
    name: "SAMPLE Triple Layer Water Tank",
    unit: "pcs",
    hsn: "3925",
    gst: "18",
    attrs: ["Capacity"],
    specs: [{ label: "Layers", value: "Sample value" }, { label: "Data source", value: "Demonstration only" }],
    featured: true,
    variants: [
      { sku: "DEMO-TNK-500", name: "500 L", attrs: { Capacity: "500 L" }, price: "3200.00", cost: "2450.00" },
      { sku: "DEMO-TNK-1000", name: "1000 L", attrs: { Capacity: "1000 L" }, price: "6100.00", cost: "4700.00" },
      { sku: "DEMO-TNK-1500", name: "1500 L", attrs: { Capacity: "1500 L" }, price: "9000.00", cost: "6900.00" },
      { sku: "DEMO-TNK-2000", name: "2000 L", attrs: { Capacity: "2000 L" }, price: "11800.00" },
    ],
  },
  {
    category: "bathware-sanitary",
    name: "SAMPLE Bib Cock",
    unit: "pcs",
    hsn: "8481",
    gst: "18",
    attrs: ["Finish"],
    specs: [{ label: "Data source", value: "Demonstration only" }],
    featured: true,
    variants: [{ sku: "DEMO-BTH-BIB-CH", name: "Chrome", attrs: { Finish: "Chrome" }, price: "450.00", cost: "300.00", tiers: [{ minQty: "10", price: "420.00" }] }],
  },
  {
    category: "bathware-sanitary",
    name: "SAMPLE Wall Mixer",
    unit: "pcs",
    hsn: "8481",
    gst: "18",
    attrs: ["Finish"],
    specs: [{ label: "Data source", value: "Demonstration only" }],
    variants: [{ sku: "DEMO-BTH-MIX-CH", name: "Chrome", attrs: { Finish: "Chrome" }, price: "2400.00", cost: "1700.00" }],
  },
  {
    category: "cpvc-pipes-fittings",
    name: "SAMPLE CPVC Pipe SDR 11",
    unit: "m",
    hsn: "3917",
    gst: "18",
    attrs: ["Size"],
    specs: [{ label: "Standard length", value: "3 m (sample)" }, { label: "Data source", value: "Demonstration only" }],
    featured: true,
    altUnit: { unit: "length", factor: "3" },
    variants: [
      { sku: "DEMO-CPVC-P-15", name: '½" (15 mm)', attrs: { Size: '½"' }, price: "62.00", cost: "41.00" },
      { sku: "DEMO-CPVC-P-20", name: '¾" (20 mm)', attrs: { Size: '¾"' }, price: "98.00", cost: "66.00" },
      { sku: "DEMO-CPVC-P-25", name: '1" (25 mm)', attrs: { Size: '1"' }, price: "150.00", cost: "101.00" },
    ],
  },
  {
    category: "cpvc-pipes-fittings",
    name: "SAMPLE CPVC Elbow 90°",
    unit: "pcs",
    hsn: "3917",
    gst: "18",
    attrs: ["Size"],
    specs: [{ label: "Data source", value: "Demonstration only" }],
    variants: [
      { sku: "DEMO-CPVC-E-15", name: '½" (15 mm)', attrs: { Size: '½"' }, price: "12.00", cost: "7.50", tiers: [{ minQty: "50", price: "10.50" }] },
      { sku: "DEMO-CPVC-E-20", name: '¾" (20 mm)', attrs: { Size: '¾"' }, price: "19.00", cost: "12.00" },
      { sku: "DEMO-CPVC-E-25", name: '1" (25 mm)', attrs: { Size: '1"' }, price: "31.00", cost: "20.00" },
    ],
  },
  {
    category: "pvc-upvc-pipes-fittings",
    name: "SAMPLE UPVC Pipe Sch 40",
    unit: "length",
    hsn: "3917",
    gst: "18",
    attrs: ["Size"],
    specs: [{ label: "Data source", value: "Demonstration only" }],
    variants: [
      { sku: "DEMO-UPVC-P-15", name: '½" × 3 m', attrs: { Size: '½"' }, price: "210.00", cost: "150.00" },
      { sku: "DEMO-UPVC-P-25", name: '1" × 3 m', attrs: { Size: '1"' }, price: "420.00" },
    ],
  },
  {
    category: "swr-drainage",
    name: "SAMPLE SWR Pipe",
    unit: "length",
    hsn: "3917",
    gst: "18",
    attrs: ["Size", "Type"],
    specs: [{ label: "Data source", value: "Demonstration only" }],
    variants: [
      { sku: "DEMO-SWR-75", name: "75 mm × 3 m", attrs: { Size: "75 mm", Type: "Single socket" }, price: "540.00", cost: "390.00" },
      { sku: "DEMO-SWR-110", name: "110 mm × 3 m", attrs: { Size: "110 mm", Type: "Single socket" }, price: "890.00", cost: "640.00" },
    ],
  },
  {
    category: "plumbing-accessories",
    name: "SAMPLE PTFE Thread Seal Tape",
    unit: "roll",
    hsn: "3919",
    gst: "18",
    attrs: ["Width"],
    specs: [{ label: "Data source", value: "Demonstration only" }],
    altUnit: { unit: "box", factor: "10" },
    variants: [{ sku: "DEMO-ACC-TAPE", name: "12 mm", attrs: { Width: "12 mm" }, price: "20.00", cost: "11.00" }],
  },
  {
    category: "plumbing-accessories",
    name: "SAMPLE CPVC Solvent Cement",
    unit: "pcs",
    hsn: "3506",
    gst: "18",
    attrs: ["Pack size"],
    specs: [{ label: "Data source", value: "Demonstration only" }],
    variants: [{ sku: "DEMO-ACC-SOLV-100", name: "100 ml", attrs: { "Pack size": "100 ml" }, price: "135.00" }],
  },
  {
    category: "other-building-materials",
    name: "SAMPLE Wall Putty",
    unit: "bag",
    hsn: "3214",
    gst: "18",
    attrs: ["Pack size"],
    specs: [{ label: "Data source", value: "Demonstration only" }],
    variants: [{ sku: "DEMO-OTH-PUTTY-40", name: "40 kg", attrs: { "Pack size": "40 kg" }, price: "950.00", cost: "720.00" }],
  },
];

async function main() {
  const { getDb, getPool } = await import("../src/server/db/client");
  const schema = await import("../src/server/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const { loadActor } = await import("../src/server/auth/actor");
  const catalog = await import("../src/server/services/catalog");
  const pricing = await import("../src/server/services/pricing");
  const db = getDb();

  const [sa] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(and(eq(schema.roles.key, "super_admin"), eq(schema.users.isActive, true)))
    .limit(1);
  if (!sa) throw new Error("No active Super Admin. Run `npm run create-super-admin` first.");
  const actor = (await loadActor(sa.id))!;

  const cats = await db.select().from(schema.categories);
  const taxes = await db.select().from(schema.taxClasses);
  let created = 0;
  for (const item of ITEMS) {
    const exists = await db.select({ id: schema.productVariants.id }).from(schema.productVariants).where(eq(schema.productVariants.sku, item.variants[0].sku));
    if (exists.length) continue;
    const cat = cats.find((c) => c.slug === item.category);
    if (!cat) throw new Error(`Category ${item.category} missing`);
    let brandId: string | null = null;
    if (item.brand) {
      const [b] = await db.select().from(schema.brands).where(eq(schema.brands.name, item.brand));
      brandId = b?.id ?? (await catalog.createBrand(actor, { name: item.brand })).id;
    }
    const tax = taxes.find((t) => Number(t.gstRate) === Number(item.gst));
    const product = await catalog.createProduct(actor, {
      name: item.name,
      categoryId: cat.id,
      brandId,
      unitCode: item.unit,
      hsnCode: item.hsn,
      taxClassId: tax?.id ?? null,
      description: SAMPLE_NOTE,
      specifications: item.specs,
      variantAttributes: item.attrs,
      isSample: true,
      isFeatured: !!item.featured,
      sourceInfo: "SAMPLE DATA — demonstration only",
    });
    const variantIds: string[] = [];
    for (const [i, v] of item.variants.entries()) {
      const variant = await catalog.createVariant(actor, product.id, { sku: v.sku, name: v.name, attributes: v.attrs, unitCode: item.unit, sortOrder: i });
      variantIds.push(variant.id);
      await pricing.proposePrice(actor, { variantId: variant.id, price: v.price, priceIncludesTax: true, mrp: v.mrp ?? null, tiers: v.tiers, reason: "SAMPLE price for demonstration" });
      if (v.cost) {
        await pricing.recordCost(actor, { variantId: variant.id, purchaseCost: v.cost, purchaseTaxRate: item.gst, freight: "0", handling: "0", otherCosts: "0", reason: "SAMPLE cost for demonstration" });
      }
      if (item.altUnit) await catalog.addUnitConversion(actor, variant.id, item.altUnit.unit, item.altUnit.factor);
    }
    await catalog.setProductReview(actor, product.id, "approved");
    await catalog.setProductPublished(actor, product.id, true);
    created++;
  }

  // Demonstrate explicit pipe ↔ fitting compatibility (same nominal size only).
  const sku = async (s: string) => (await db.select().from(schema.productVariants).where(eq(schema.productVariants.sku, s)))[0];
  for (const size of ["15", "20", "25"]) {
    const pipe = await sku(`DEMO-CPVC-P-${size}`);
    const elbow = await sku(`DEMO-CPVC-E-${size}`);
    if (pipe && elbow) await catalog.linkCompatibility(actor, pipe.id, elbow.id, "Same nominal size (sample data)");
  }
  console.log(created ? `Created ${created} SAMPLE products.` : "Sample products already present.");
  await getPool().end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
