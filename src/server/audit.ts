import "server-only";
import { auditLogs } from "@/server/db/schema";
import type { Tx } from "@/server/db/client";

/** Who did it. `null` user = system / public website. */
export interface AuditActor {
  userId: string | null;
  label: string;
  ip?: string | null;
  userAgent?: string | null;
}

export const SYSTEM_ACTOR: AuditActor = { userId: null, label: "system" };

export interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: string | null;
  summary: string;
  data?: Record<string, unknown>;
}

/**
 * Append an audit record. Call inside the same transaction as the change it describes,
 * so the change and its audit trail commit (or roll back) together.
 */
export async function audit(tx: Tx, actor: AuditActor, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLogs).values({
    actorUserId: actor.userId,
    actorLabel: actor.label,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    summary: entry.summary,
    data: entry.data ?? null,
    ip: actor.ip ?? null,
    userAgent: actor.userAgent?.slice(0, 300) ?? null,
  });
}

/** Shallow diff of two plain objects, for audit `data`. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[k];
    const b = after[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[k] = { from: a, to: b };
  }
  return changes;
}
