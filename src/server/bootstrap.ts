/**
 * Idempotent reference data needed by every installation (NOT demo data):
 * roles & default permissions, units, tax classes, price lists, settings defaults,
 * the shop's initial product categories and a default stock location.
 *
 * Safe to run on every deploy: existing rows are never overwritten, so changes the
 * Super Admin makes later (role permissions, settings, categories) are preserved.
 */
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DEFAULT_ROLES } from "@/lib/permissions";
import { SETTINGS_DEFAULTS } from "@/lib/settings-schema";
import * as schema from "@/server/db/schema";

type Db = NodePgDatabase<typeof schema>;

export const UNITS = [
  { code: "pcs", name: "Piece", uqc: "PCS", decimals: 0 },
  { code: "nos", name: "Number", uqc: "NOS", decimals: 0 },
  { code: "ltr", name: "Litre", uqc: "LTR", decimals: 2 },
  { code: "bucket", name: "Bucket", uqc: "OTH", decimals: 0 },
  { code: "m", name: "Metre", uqc: "MTR", decimals: 2 },
  { code: "ft", name: "Foot", uqc: "OTH", decimals: 2 },
  { code: "length", name: "Length (pipe)", uqc: "NOS", decimals: 0 },
  { code: "kg", name: "Kilogram", uqc: "KGS", decimals: 3 },
  { code: "box", name: "Box", uqc: "BOX", decimals: 0 },
  { code: "set", name: "Set", uqc: "SET", decimals: 0 },
  { code: "roll", name: "Roll", uqc: "ROL", decimals: 0 },
  { code: "pack", name: "Pack", uqc: "PAC", decimals: 0 },
  { code: "bag", name: "Bag", uqc: "BAG", decimals: 0 },
];

/** Rates must be confirmed with the accountant against current CBIC notifications. */
export const TAX_CLASSES = [
  { name: "GST 18%", gstRate: "18", isExempt: false, description: "Standard rate (Sch. II). Verify HSN applicability." },
  { name: "GST 5%", gstRate: "5", isExempt: false, description: "Merit rate (Sch. I). Verify HSN applicability." },
  { name: "Nil / Exempt (0%)", gstRate: "0", isExempt: true, description: "Exempt or nil-rated supplies." },
];

export const INITIAL_CATEGORIES = [
  { slug: "berger-paints", name: "Berger Paints", icon: "paint", description: "Interior & exterior emulsions, enamels, primers, putty and waterproofing." },
  { slug: "umiya-gold-water-tanks", name: "Umiya Gold Water Tanks", icon: "tank", description: "Plastic water storage tanks in multiple capacities and layers." },
  { slug: "bathware-sanitary", name: "Bathware & Sanitary Fittings", icon: "bath", description: "Taps, mixers, showers, basins, closets and bathroom accessories." },
  { slug: "cpvc-pipes-fittings", name: "CPVC Pipes & Fittings", icon: "pipe", description: "Hot & cold water CPVC pipes, elbows, tees, couplers and valves." },
  { slug: "pvc-upvc-pipes-fittings", name: "PVC & UPVC Pipes & Fittings", icon: "pipe", description: "PVC and UPVC pressure pipes and fittings for plumbing and agriculture." },
  { slug: "swr-drainage", name: "SWR & Drainage Systems", icon: "drain", description: "Soil, waste & rain-water pipes, bends, traps and drainage fittings." },
  { slug: "plumbing-accessories", name: "Plumbing Accessories", icon: "wrench", description: "Solvent cement, teflon tape, clamps, connectors and tools." },
  { slug: "other-building-materials", name: "Other Building Materials", icon: "brick", description: "Other construction and hardware essentials." },
];

export async function bootstrap(db: Db): Promise<{ created: string[] }> {
  const created: string[] = [];
  await db.transaction(async (tx) => {
    // Roles + default permissions (only for roles that don't exist yet)
    for (const r of DEFAULT_ROLES) {
      const inserted = await tx
        .insert(schema.roles)
        .values({
          key: r.key,
          name: r.name,
          description: r.description,
          isSystem: true,
          defaultDiscountLimitPercent: r.discountLimit,
          defaultApprovalLimitPercent: r.approvalLimit,
        })
        .onConflictDoNothing({ target: schema.roles.key })
        .returning({ id: schema.roles.id });
      if (inserted.length) {
        created.push(`role:${r.key}`);
        if (r.key !== "super_admin" && r.permissions.length) {
          await tx
            .insert(schema.rolePermissions)
            .values(r.permissions.map((p) => ({ roleId: inserted[0].id, permission: p })));
        }
      }
    }

    for (const u of UNITS) {
      const res = await tx.insert(schema.units).values(u).onConflictDoNothing().returning();
      if (res.length) created.push(`unit:${u.code}`);
    }

    for (const t of TAX_CLASSES) {
      const res = await tx.insert(schema.taxClasses).values(t).onConflictDoNothing().returning();
      if (res.length) created.push(`tax:${t.name}`);
    }

    const lists = [
      { code: "retail", name: "Retail", isDefault: true, isPublic: true, isActive: true },
      { code: "wholesale", name: "Wholesale", isDefault: false, isPublic: false, isActive: false },
      { code: "contractor", name: "Contractor", isDefault: false, isPublic: false, isActive: false },
    ];
    for (const l of lists) {
      const res = await tx.insert(schema.priceLists).values(l).onConflictDoNothing().returning();
      if (res.length) created.push(`price_list:${l.code}`);
    }

    for (const [section, value] of Object.entries(SETTINGS_DEFAULTS)) {
      const res = await tx.insert(schema.settings).values({ section, value }).onConflictDoNothing().returning();
      if (res.length) created.push(`settings:${section}`);
    }

    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(schema.categories);
    if (count === 0) {
      await tx.insert(schema.categories).values(INITIAL_CATEGORIES.map((c, i) => ({ ...c, sortOrder: i + 1 })));
      created.push("categories:initial");
    }

    const loc = await tx
      .insert(schema.stockLocations)
      .values({ code: "MAIN", name: "Main Shop — Naswadi", isDefault: true })
      .onConflictDoNothing()
      .returning();
    if (loc.length) created.push("stock_location:MAIN");
  });
  return { created };
}
