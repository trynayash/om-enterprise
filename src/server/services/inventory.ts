import "server-only";
/**
 * Inventory & suppliers — data model ready, workflow OFF by default.
 * Stock is never deducted and never shown publicly until the Super Admin enables inventory
 * in Settings and the opening stock has been counted and entered.
 */
import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { productVariants, products, stockLocations, stockMovements, suppliers } from "@/server/db/schema";
import { audit } from "@/server/audit";
import { auditActorOf, requirePermission, type Actor } from "@/server/auth/actor";
import { invalid, notFound, precondition } from "@/server/errors";
import { getSettings } from "@/server/settings";
import { validateGstin, normalizeMobile } from "@/lib/india";
import { D } from "@/lib/money";
import { lineDescription } from "@/lib/line-description";

export async function listSuppliers(actor: Actor) {
  requirePermission(actor, ["inventory.view", "inventory.manage", "costs.edit"]);
  return getDb().select().from(suppliers).orderBy(asc(suppliers.name));
}

export async function saveSupplier(
  actor: Actor,
  input: { id?: string; name: string; gstin?: string | null; mobile?: string | null; email?: string | null; address?: string | null; notes?: string | null; isActive?: boolean },
) {
  requirePermission(actor, "inventory.manage");
  const gstin = input.gstin?.trim() ? validateGstin(input.gstin) : null;
  if (gstin && !gstin.ok) throw invalid(gstin.error);
  const mobile = input.mobile?.trim() ? normalizeMobile(input.mobile) : null;
  if (input.mobile?.trim() && !mobile) throw invalid("Invalid mobile number");
  const values = {
    name: input.name.trim(),
    gstin: gstin && gstin.ok ? gstin.normalized : null,
    mobile,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
    isActive: input.isActive ?? true,
  };
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = input.id
      ? await tx.update(suppliers).set(values).where(eq(suppliers.id, input.id)).returning()
      : await tx.insert(suppliers).values({ ...values, createdBy: actor.id }).returning();
    if (!row) throw notFound("Supplier");
    await audit(tx, auditActorOf(actor), { action: input.id ? "supplier.update" : "supplier.create", entityType: "supplier", entityId: row.id, summary: `${input.id ? "Updated" : "Created"} supplier ${row.name}` });
    return row;
  });
}

export async function recordStockMovement(
  actor: Actor,
  input: { variantId: string; quantityChange: string; movementType: "opening" | "adjustment" | "damage" | "purchase_receipt" | "supplier_return"; note: string; unitCost?: string | null },
) {
  requirePermission(actor, "inventory.manage");
  const inv = await getSettings("inventory");
  if (!inv.enabled) throw precondition("Inventory is not enabled. The Super Admin can enable it in Settings once opening stock is counted.");
  if (!input.note.trim()) throw invalid("Add a note explaining the stock movement");
  const q = D(input.quantityChange);
  if (q.isZero()) throw invalid("Quantity cannot be zero");
  if ((input.movementType === "damage" || input.movementType === "supplier_return") && q.isPositive()) throw invalid("Damage/supplier returns reduce stock — use a negative quantity");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [loc] = await tx.select().from(stockLocations).where(eq(stockLocations.isDefault, true));
    const [v] = await tx.select({ sku: productVariants.sku }).from(productVariants).where(eq(productVariants.id, input.variantId));
    if (!v) throw notFound("Variant");
    const [row] = await tx
      .insert(stockMovements)
      .values({ variantId: input.variantId, locationId: loc.id, quantityChange: q.toString(), movementType: input.movementType, note: input.note.trim(), unitCost: input.unitCost ?? null, createdBy: actor.id })
      .returning();
    await audit(tx, auditActorOf(actor), {
      action: "stock.movement",
      entityType: "variant",
      entityId: input.variantId,
      summary: `Stock ${input.movementType} ${q.isPositive() ? "+" : ""}${q.toString()} for ${v.sku}`,
      data: { note: input.note },
    });
    return row;
  });
}

export async function stockLevels(actor: Actor) {
  requirePermission(actor, ["inventory.view", "inventory.manage"]);
  const inv = await getSettings("inventory");
  if (!inv.enabled) return { enabled: false as const, items: [] };
  const db = getDb();
  const items = await db
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      productName: products.name,
      variantName: productVariants.name,
      reorderLevel: productVariants.reorderLevel,
      onHand: sql<string>`coalesce((select sum(m.quantity_change) from stock_movements m where m.variant_id = ${productVariants.id}), 0)::text`,
      movements: sql<number>`(select count(*)::int from stock_movements m where m.variant_id = "product_variants"."id")`,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.isActive, true))
    .orderBy(asc(products.name));
  return {
    enabled: true as const,
    items: items.map(({ productName, variantName, ...i }) => ({
      ...i,
      name: lineDescription(null, productName, variantName),
      low: i.reorderLevel !== null && D(i.onHand).lessThanOrEqualTo(D(i.reorderLevel)),
    })),
  };
}

export async function recentMovements(actor: Actor) {
  requirePermission(actor, ["inventory.view", "inventory.manage"]);
  return getDb().select().from(stockMovements).orderBy(desc(stockMovements.createdAt)).limit(100);
}
