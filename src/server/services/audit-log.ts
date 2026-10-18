import "server-only";
import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import { requirePermission, type Actor } from "@/server/auth/actor";

export interface AuditFilter {
  q?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export async function queryAudit(actor: Actor, f: AuditFilter) {
  requirePermission(actor, "audit.view");
  const db = getDb();
  const where: SQL[] = [];
  if (f.action) where.push(ilike(auditLogs.action, `${f.action}%`));
  if (f.entityType) where.push(eq(auditLogs.entityType, f.entityType));
  if (f.entityId) where.push(eq(auditLogs.entityId, f.entityId));
  if (f.actorUserId) where.push(eq(auditLogs.actorUserId, f.actorUserId));
  if (f.from) where.push(gte(auditLogs.at, f.from));
  if (f.to) where.push(lte(auditLogs.at, f.to));
  if (f.q?.trim()) {
    const like = `%${f.q.trim()}%`;
    where.push(or(ilike(auditLogs.summary, like), ilike(auditLogs.actorLabel, like), ilike(auditLogs.entityId, like))!);
  }
  const pageSize = Math.min(f.pageSize ?? 100, 500);
  const page = Math.max(1, f.page ?? 1);
  const rows = await db
    .select({ a: auditLogs, total: sql<number>`count(*) over ()::int` })
    .from(auditLogs)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(auditLogs.at), desc(auditLogs.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { total: rows[0]?.total ?? 0, page, pageSize, items: rows.map((r) => r.a) };
}

/** Audit trail for one record (sale, product, document, user…) — used on detail pages. */
export async function entityHistory(actor: Actor, entityType: string, entityId: string) {
  requirePermission(actor, ["audit.view", "sales.view_all", "catalog.edit"]);
  const db = getDb();
  return db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
    .orderBy(desc(auditLogs.at))
    .limit(200);
}
