import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { saleReturnLines, saleReturns, units, users } from "@/server/db/schema";

/** Quantity already returned per sale line, and total credited, for one sale (read-only). */
export async function returnSummary(saleId: string) {
  const db = getDb();
  const rows = await db
    .select({ saleLineId: saleReturnLines.saleLineId, qty: sql<string>`sum(${saleReturnLines.quantity})::text` })
    .from(saleReturnLines)
    .innerJoin(saleReturns, eq(saleReturns.id, saleReturnLines.returnId))
    .where(eq(saleReturns.saleId, saleId))
    .groupBy(saleReturnLines.saleLineId);
  const [credited] = await db
    .select({ total: sql<string>`coalesce(sum(${saleReturns.grandTotal}), 0)::text`, count: sql<number>`count(*)::int` })
    .from(saleReturns)
    .where(eq(saleReturns.saleId, saleId));
  return { returned: new Map(rows.map((r) => [r.saleLineId, r.qty])), creditedTotal: credited.total, returnCount: credited.count };
}

export async function displayNames(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  if (!unique.length) return new Map<string, string>();
  const rows = await getDb().select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function unitMap() {
  const rows = await getDb().select().from(units);
  return new Map(rows.map((u) => [u.code, u]));
}
