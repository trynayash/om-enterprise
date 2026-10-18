import "server-only";
import { eq } from "drizzle-orm";
import { getDb, type Tx } from "@/server/db/client";
import { rolePermissions, roles, userPermissionOverrides, users } from "@/server/db/schema";
import { ALL_PERMISSIONS, type Permission } from "@/lib/permissions";
import type { AuditActor } from "@/server/audit";
import { AppError, forbidden } from "@/server/errors";

/** The authenticated staff member performing an operation. Built fresh per request. */
export interface Actor {
  id: string;
  username: string;
  displayName: string;
  roleKey: string;
  roleName: string;
  isSuperAdmin: boolean;
  permissions: ReadonlySet<string>;
  /** Max discount % this user may apply without approval. */
  discountLimitPercent: string;
  /** Max discount % this user may approve for others. */
  approvalLimitPercent: string;
  mustChangePassword: boolean;
  ip?: string | null;
  userAgent?: string | null;
}

export async function loadActor(userId: string, tx?: Tx): Promise<Actor | null> {
  const db = tx ?? getDb();
  const rows = await db
    .select({ user: users, role: roles })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(eq(users.id, userId));
  const row = rows[0];
  if (!row || !row.user.isActive) return null;
  const { user, role } = row;
  const isSuperAdmin = role.key === "super_admin";

  let permissions: Set<string>;
  if (isSuperAdmin) {
    permissions = new Set<string>(ALL_PERMISSIONS);
  } else {
    const rp = await db.select({ p: rolePermissions.permission }).from(rolePermissions).where(eq(rolePermissions.roleId, role.id));
    permissions = new Set(rp.map((r) => r.p));
    const overrides = await db
      .select({ p: userPermissionOverrides.permission, effect: userPermissionOverrides.effect })
      .from(userPermissionOverrides)
      .where(eq(userPermissionOverrides.userId, user.id));
    for (const o of overrides) {
      if (o.effect === "grant") permissions.add(o.p);
      else permissions.delete(o.p);
    }
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    roleKey: role.key,
    roleName: role.name,
    isSuperAdmin,
    permissions,
    discountLimitPercent: user.discountLimitPercent ?? role.defaultDiscountLimitPercent,
    approvalLimitPercent: isSuperAdmin ? "100" : (user.approvalLimitPercent ?? role.defaultApprovalLimitPercent),
    mustChangePassword: user.mustChangePassword,
  };
}

export function can(actor: Actor | null | undefined, permission: Permission): boolean {
  if (!actor) return false;
  return actor.isSuperAdmin || actor.permissions.has(permission);
}

export function canAny(actor: Actor | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((p) => can(actor, p));
}

export function requirePermission(actor: Actor | null | undefined, permission: Permission | Permission[]): Actor {
  if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in");
  const list = Array.isArray(permission) ? permission : [permission];
  if (!list.some((p) => can(actor, p))) {
    throw forbidden();
  }
  return actor;
}

export function requireSuperAdmin(actor: Actor | null | undefined): Actor {
  if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in");
  if (!actor.isSuperAdmin) throw forbidden("Only the Super Admin can do this");
  return actor;
}

export function auditActorOf(actor: Actor): AuditActor {
  return {
    userId: actor.id,
    label: `${actor.displayName} (${actor.roleKey})`,
    ip: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  };
}

/** Client-safe subset (never includes hashes or internal ids beyond the user id). */
export function publicActor(actor: Actor) {
  return {
    id: actor.id,
    username: actor.username,
    displayName: actor.displayName,
    roleKey: actor.roleKey,
    roleName: actor.roleName,
    isSuperAdmin: actor.isSuperAdmin,
    permissions: [...actor.permissions].sort(),
    discountLimitPercent: actor.discountLimitPercent,
    approvalLimitPercent: actor.approvalLimitPercent,
    mustChangePassword: actor.mustChangePassword,
  };
}
export type PublicActor = ReturnType<typeof publicActor>;
