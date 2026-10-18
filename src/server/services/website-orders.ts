import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { users, websiteOrderLines, websiteOrders } from "@/server/db/schema";
import { audit } from "@/server/audit";
import { auditActorOf, requirePermission, type Actor } from "@/server/auth/actor";
import { conflict, invalid, notFound, precondition } from "@/server/errors";
import { enforceRateLimit, hashIp } from "@/server/rate-limit";
import { getSettings } from "@/server/settings";
import { pricePublicCart } from "@/server/services/public-catalog";
import { addLine, createSale } from "@/server/services/sales";
import { isValidEmail, normalizeMobile } from "@/lib/india";

export interface WebsiteOrderSubmission {
  kind: "enquiry" | "order_request";
  customerName: string;
  mobile: string;
  email?: string | null;
  city?: string | null;
  address?: string | null;
  message?: string | null;
  preferredContact?: "call" | "whatsapp" | "email" | null;
  items: { variantId: string; quantity: string }[];
  website?: string;
}

/** Public: customers submit an enquiry or order request. Prices are re-computed server-side. */
export async function submitWebsiteOrder(input: WebsiteOrderSubmission, ip: string) {
  const website = await getSettings("website");
  if (!website.enquiriesEnabled) throw precondition("Online enquiries are currently closed. Please call or WhatsApp us.");
  if (input.website) throw invalid("Invalid submission"); // honeypot
  await enforceRateLimit(`enquiry:${hashIp(ip)}`, 5, 15 * 60, "Too many enquiries from this device. Please try again later or WhatsApp us.");
  const mobile = normalizeMobile(input.mobile);
  if (!mobile) throw invalid("Please enter a valid 10-digit mobile number");
  if (input.email && !isValidEmail(input.email)) throw invalid("Please enter a valid email address");
  if (input.kind === "order_request" && !input.items.length) throw invalid("Add at least one product to your order request");
  if (!input.items.length && !input.message?.trim()) throw invalid("Tell us what you need");

  const priced = await pricePublicCart(input.items);
  if (input.items.length && priced.lines.length !== input.items.length) {
    throw invalid("Some items in your list are no longer available. Please refresh and try again.");
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    const seq = await tx.execute<{ n: number }>(sql`select nextval('website_order_seq')::int as n`);
    const orderNumber = `W${String(seq.rows[0].n).padStart(6, "0")}`;
    const [order] = await tx
      .insert(websiteOrders)
      .values({
        orderNumber,
        kind: input.kind,
        customerName: input.customerName.trim().slice(0, 120),
        mobile,
        email: input.email?.trim() || null,
        city: input.city?.trim() || null,
        address: input.address?.trim() || null,
        message: input.message?.trim() || null,
        preferredContact: input.preferredContact ?? null,
        indicativeTotal: priced.lines.length && priced.allPriced ? priced.total : null,
        ipHash: hashIp(ip),
      })
      .returning();
    if (priced.lines.length) {
      await tx.insert(websiteOrderLines).values(
        priced.lines.map((l) => ({
          orderId: order.id,
          variantId: l.variantId,
          productName: l.productName,
          variantName: l.variantName,
          sku: l.sku,
          quantity: l.quantity,
          indicativeUnitPrice: l.unitPrice,
          priceIncludesTax: l.priceIncludesTax,
        })),
      );
    }
    await audit(tx, { userId: null, label: "public website" }, {
      action: "website_order.submit",
      entityType: "website_order",
      entityId: order.id,
      summary: `New website ${input.kind === "order_request" ? "order request" : "enquiry"} ${orderNumber} (${priced.lines.length} items)`,
    });
    return { orderNumber, indicativeTotal: order.indicativeTotal, lines: priced.lines };
  });
}

export async function listWebsiteOrders(actor: Actor, status?: string) {
  requirePermission(actor, "orders.view");
  const db = getDb();
  const rows = await db
    .select({ o: websiteOrders, handledByName: users.displayName, itemCount: sql<number>`(select count(*)::int from website_order_lines l where l.order_id = ${websiteOrders.id})` })
    .from(websiteOrders)
    .leftJoin(users, eq(users.id, websiteOrders.handledBy))
    .where(status ? eq(websiteOrders.status, status as typeof websiteOrders.$inferSelect.status) : undefined)
    .orderBy(desc(websiteOrders.createdAt))
    .limit(200);
  return rows.map((r) => ({ ...r.o, ipHash: undefined, handledByName: r.handledByName, itemCount: r.itemCount }));
}

export async function getWebsiteOrder(actor: Actor, id: string) {
  requirePermission(actor, "orders.view");
  const db = getDb();
  const [o] = await db.select().from(websiteOrders).where(eq(websiteOrders.id, id));
  if (!o) throw notFound("Order request");
  const lines = await db.select().from(websiteOrderLines).where(eq(websiteOrderLines.orderId, id));
  return { order: { ...o, ipHash: undefined }, lines };
}

export async function updateWebsiteOrder(actor: Actor, id: string, input: { status?: typeof websiteOrders.$inferSelect.status; staffNotes?: string | null }) {
  requirePermission(actor, "orders.manage");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(websiteOrders).where(eq(websiteOrders.id, id));
    if (!o) throw notFound("Order request");
    if (input.status === "converted") throw invalid("Use 'Convert to sale' to mark an order as converted");
    await tx
      .update(websiteOrders)
      .set({ status: input.status ?? o.status, staffNotes: input.staffNotes === undefined ? o.staffNotes : input.staffNotes, handledBy: actor.id, updatedAt: new Date() })
      .where(eq(websiteOrders.id, id));
    await audit(tx, auditActorOf(actor), {
      action: "website_order.update",
      entityType: "website_order",
      entityId: id,
      summary: `Updated ${o.orderNumber}${input.status ? `: ${o.status} → ${input.status}` : ""}`,
    });
  });
}

/** Turn an order request into a POS draft at CURRENT prices (website prices were indicative). */
export async function convertWebsiteOrder(actor: Actor, id: string) {
  requirePermission(actor, ["orders.manage"]);
  requirePermission(actor, "sales.create");
  const db = getDb();
  const [o] = await db.select().from(websiteOrders).where(eq(websiteOrders.id, id));
  if (!o) throw notFound("Order request");
  if (o.convertedSaleId) throw conflict("Already converted to a sale");
  const lines = await db.select().from(websiteOrderLines).where(eq(websiteOrderLines.orderId, id));
  const sale = await createSale(actor, { source: "website_order", websiteOrderId: id });
  const skipped: string[] = [];
  for (const l of lines) {
    try {
      await addLine(actor, sale.id, { variantId: l.variantId, quantity: l.quantity });
    } catch {
      skipped.push(l.sku);
    }
  }
  await db.transaction(async (tx) => {
    await tx.update(websiteOrders).set({ status: "converted", convertedSaleId: sale.id, handledBy: actor.id, updatedAt: new Date() }).where(and(eq(websiteOrders.id, id)));
    await audit(tx, auditActorOf(actor), {
      action: "website_order.convert",
      entityType: "website_order",
      entityId: id,
      summary: `Converted ${o.orderNumber} to sale ${sale.saleNumber}${skipped.length ? ` (skipped ${skipped.join(", ")})` : ""}`,
    });
  });
  return { saleId: sale.id, saleNumber: sale.saleNumber, skipped };
}

export async function newOrderCount() {
  const db = getDb();
  const [r] = await db.select({ c: sql<number>`count(*)::int` }).from(websiteOrders).where(inArray(websiteOrders.status, ["new"]));
  return r.c;
}
