import "server-only";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb, type Tx } from "@/server/db/client";
import { customers, sales } from "@/server/db/schema";
import { audit, diff } from "@/server/audit";
import { auditActorOf, can, requirePermission, type Actor } from "@/server/auth/actor";
import { invalid, notFound } from "@/server/errors";
import { isValidEmail, isValidPincode, isValidStateCode, normalizeMobile, stateName, validateGstin } from "@/lib/india";

export interface CustomerInput {
  name: string;
  mobile?: string | null;
  email?: string | null;
  businessName?: string | null;
  gstin?: string | null;
  billingAddress?: string | null;
  city?: string | null;
  stateCode?: string | null;
  pincode?: string | null;
  customerType?: "retail" | "contractor" | "business";
  notes?: string | null;
}

/** Validate & normalise. Only the name is required; everything else is optional unless the bill needs it. */
export function cleanCustomer(input: CustomerInput) {
  const name = input.name?.trim();
  if (!name || name.length < 1) throw invalid("Customer name is required");
  let mobile: string | null = null;
  if (input.mobile?.trim()) {
    mobile = normalizeMobile(input.mobile);
    if (!mobile) throw invalid("Enter a valid 10-digit Indian mobile number");
  }
  const email = input.email?.trim() || null;
  if (email && !isValidEmail(email)) throw invalid("Enter a valid email address");
  let gstin: string | null = null;
  let stateCode = input.stateCode?.trim() || null;
  if (stateCode && !isValidStateCode(stateCode)) throw invalid("Select a valid state");
  if (input.gstin?.trim()) {
    const g = validateGstin(input.gstin);
    if (!g.ok) throw invalid(g.error);
    gstin = g.normalized;
    if (stateCode && stateCode !== g.stateCode) {
      throw invalid(`GSTIN belongs to ${stateName(g.stateCode)} (${g.stateCode}) but the state selected is ${stateName(stateCode)}`);
    }
    stateCode = g.stateCode;
  }
  const pincode = input.pincode?.trim() || null;
  if (pincode && !isValidPincode(pincode)) throw invalid("Enter a valid 6-digit PIN code");
  return {
    name: name.slice(0, 120),
    mobile,
    email,
    businessName: input.businessName?.trim() || null,
    gstin,
    billingAddress: input.billingAddress?.trim() || null,
    city: input.city?.trim() || null,
    stateCode,
    pincode,
    customerType: input.customerType ?? (gstin ? "business" : "retail"),
    notes: input.notes?.trim() || null,
  } as const;
}

export async function searchCustomers(actor: Actor, q: string, limit = 20) {
  requirePermission(actor, ["customers.view", "sales.create"]);
  const db = getDb();
  const term = q.trim();
  if (!term) {
    return db.select().from(customers).orderBy(desc(customers.updatedAt)).limit(limit);
  }
  const like = `%${term}%`;
  const digits = term.replace(/\D/g, "");
  return db
    .select()
    .from(customers)
    .where(
      or(
        ilike(customers.name, like),
        ilike(customers.businessName, like),
        digits.length >= 4 ? ilike(customers.mobile, `%${digits}%`) : undefined,
        ilike(customers.gstin, like),
      ),
    )
    .orderBy(desc(customers.updatedAt))
    .limit(limit);
}

export async function createCustomer(actor: Actor, input: CustomerInput, tx?: Tx) {
  requirePermission(actor, ["customers.edit", "sales.create"]);
  const data = cleanCustomer(input);
  const run = async (t: Tx) => {
    const [row] = await t.insert(customers).values({ ...data, createdBy: actor.id }).returning();
    await audit(t, auditActorOf(actor), {
      action: "customer.create",
      entityType: "customer",
      entityId: row.id,
      summary: `Created customer ${row.name}${row.mobile ? ` (${row.mobile.slice(0, 2)}xxxxxx${row.mobile.slice(-2)})` : ""}`,
    });
    return row;
  };
  return tx ? run(tx) : getDb().transaction(run);
}

export async function updateCustomer(actor: Actor, id: string, input: CustomerInput, tx?: Tx) {
  requirePermission(actor, ["customers.edit", "sales.create"]);
  const data = cleanCustomer(input);
  const run = async (t: Tx) => {
    const [before] = await t.select().from(customers).where(eq(customers.id, id));
    if (!before) throw notFound("Customer");
    const [row] = await t.update(customers).set({ ...data, updatedAt: new Date() }).where(eq(customers.id, id)).returning();
    const changes = diff(before as Record<string, unknown>, row as Record<string, unknown>);
    delete changes.updatedAt;
    if (Object.keys(changes).length) {
      await audit(t, auditActorOf(actor), {
        action: "customer.update",
        entityType: "customer",
        entityId: id,
        summary: `Updated customer ${row.name}`,
        data: { fields: Object.keys(changes) },
      });
    }
    return row;
  };
  return tx ? run(tx) : getDb().transaction(run);
}

export async function getCustomer(actor: Actor, id: string) {
  requirePermission(actor, ["customers.view", "sales.create"]);
  const db = getDb();
  const [c] = await db.select().from(customers).where(eq(customers.id, id));
  if (!c) throw notFound("Customer");
  const scope = can(actor, "sales.view_all") ? undefined : eq(sales.createdBy, actor.id);
  const history = await db
    .select({
      id: sales.id,
      saleNumber: sales.saleNumber,
      status: sales.status,
      paymentStatus: sales.paymentStatus,
      grandTotal: sales.grandTotal,
      amountPaid: sales.amountPaid,
      createdAt: sales.createdAt,
      docNumber: sql<string | null>`(select d.doc_number from documents d where d.sale_id = ${sales.id} and d.doc_type not in ('quotation','credit_note') order by d.issued_at desc limit 1)`,
    })
    .from(sales)
    .where(and(eq(sales.customerId, id), eq(sales.isTraining, false), scope))
    .orderBy(desc(sales.createdAt))
    .limit(100);
  return { customer: c, history };
}

export async function listCustomers(actor: Actor, q?: string, page = 1, pageSize = 50) {
  requirePermission(actor, "customers.view");
  const db = getDb();
  const like = q?.trim() ? `%${q.trim()}%` : null;
  const rows = await db
    .select({
      c: customers,
      saleCount: sql<number>`(select count(*)::int from sales s where s.customer_id = ${customers.id} and s.status = 'completed' and not s.is_training)`,
      lifetime: sql<string>`(select coalesce(sum(s.grand_total),0)::text from sales s where s.customer_id = ${customers.id} and s.status = 'completed' and not s.is_training)`,
      total: sql<number>`count(*) over ()::int`,
    })
    .from(customers)
    .where(like ? or(ilike(customers.name, like), ilike(customers.mobile, like), ilike(customers.businessName, like), ilike(customers.gstin, like)) : undefined)
    .orderBy(desc(customers.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { total: rows[0]?.total ?? 0, items: rows.map((r) => ({ ...r.c, saleCount: r.saleCount, lifetimeValue: r.lifetime })) };
}
