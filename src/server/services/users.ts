import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, type Tx } from "@/server/db/client";
import { rolePermissions, roles, sessions, userPermissionOverrides, users } from "@/server/db/schema";
import { audit } from "@/server/audit";
import { auditActorOf, can, requirePermission, requireSuperAdmin, type Actor } from "@/server/auth/actor";
import { checkPasswordStrength, hashPassword } from "@/server/auth/password";
import { revokeUserSessions } from "@/server/services/auth";
import { getSettings } from "@/server/settings";
import { AppError, conflict, forbidden, invalid, notFound } from "@/server/errors";
import { isPermission, SUPER_ADMIN_ONLY, type Permission } from "@/lib/permissions";
import { D } from "@/lib/money";

export interface StaffRow {
  id: string;
  username: string;
  displayName: string;
  mobile: string | null;
  email: string | null;
  roleKey: string;
  roleName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  discountLimitPercent: string | null;
  approvalLimitPercent: string | null;
  roleDiscountLimitPercent: string;
  roleApprovalLimitPercent: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  lockedUntil: Date | null;
  overrides: { permission: string; effect: "grant" | "deny" }[];
}

function canViewStaff(actor: Actor) {
  return actor.isSuperAdmin || can(actor, "users.manage");
}

export async function listStaff(actor: Actor): Promise<StaffRow[]> {
  if (!canViewStaff(actor)) throw forbidden();
  const db = getDb();
  const rows = await db
    .select({ u: users, r: roles })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .orderBy(asc(users.displayName));
  const overrides = await db.select().from(userPermissionOverrides);
  return rows.map(({ u, r }) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    mobile: u.mobile,
    email: u.email,
    roleKey: r.key,
    roleName: r.name,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    discountLimitPercent: u.discountLimitPercent,
    approvalLimitPercent: u.approvalLimitPercent,
    roleDiscountLimitPercent: r.defaultDiscountLimitPercent,
    roleApprovalLimitPercent: r.defaultApprovalLimitPercent,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    lockedUntil: u.lockedUntil,
    overrides: overrides.filter((o) => o.userId === u.id).map((o) => ({ permission: o.permission, effect: o.effect })),
  }));
}

export async function listRoles() {
  const db = getDb();
  const rs = await db.select().from(roles).orderBy(asc(roles.name));
  const perms = await db.select().from(rolePermissions);
  return rs.map((r) => ({
    ...r,
    permissions: r.key === "super_admin" ? ["*"] : perms.filter((p) => p.roleId === r.id).map((p) => p.permission).sort(),
  }));
}

async function roleByKey(tx: Tx, key: string) {
  const [r] = await tx.select().from(roles).where(eq(roles.key, key));
  if (!r) throw invalid(`Unknown role "${key}"`);
  return r;
}

async function targetUser(tx: Tx, id: string) {
  const rows = await tx
    .select({ u: users, r: roles })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(eq(users.id, id));
  if (!rows[0]) throw notFound("Staff member");
  return rows[0];
}

async function activeSuperAdminCount(tx: Tx): Promise<number> {
  const [row] = await tx
    .select({ c: sql<number>`count(*)::int` })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(and(eq(roles.key, "super_admin"), eq(users.isActive, true)));
  return row.c;
}

/**
 * Non-super-admins with users.manage may only manage "sales" role staff.
 * Nobody can manage their own account here (use account settings).
 */
function assertCanManageTarget(actor: Actor, targetRoleKey: string, targetId?: string) {
  if (targetId && targetId === actor.id) throw forbidden("You cannot change your own account access here");
  if (actor.isSuperAdmin) return;
  requirePermission(actor, "users.manage");
  if (targetRoleKey !== "sales") throw forbidden("Only the Super Admin can manage administrator accounts");
}

/**
 * A sales-role account the Super Admin has individually elevated (extra permissions, or limits above
 * the role's defaults) is managed by the Super Admin only: otherwise a users.manage holder could reset
 * its password, or reactivate it, and act with those powers.
 */
async function assertMayManageElevated(tx: Tx, actor: Actor, u: typeof users.$inferSelect, r: typeof roles.$inferSelect) {
  if (actor.isSuperAdmin) return;
  const [grant] = await tx
    .select({ p: userPermissionOverrides.permission })
    .from(userPermissionOverrides)
    .where(and(eq(userPermissionOverrides.userId, u.id), eq(userPermissionOverrides.effect, "grant")))
    .limit(1);
  const above = (v: string | null, roleDefault: string) => v !== null && D(v).greaterThan(D(roleDefault));
  if (grant || above(u.discountLimitPercent, r.defaultDiscountLimitPercent) || above(u.approvalLimitPercent, r.defaultApprovalLimitPercent)) {
    throw forbidden("This account has extra powers granted by the Super Admin, so only the Super Admin can reset or reactivate it");
  }
}

function validLimit(v: string | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(v) || D(v).greaterThan(100)) throw invalid("Limits must be a percentage between 0 and 100");
  return D(v).toFixed(2);
}

export async function createStaff(
  actor: Actor,
  input: {
    username: string;
    displayName: string;
    mobile?: string | null;
    email?: string | null;
    roleKey: string;
    temporaryPassword: string;
    discountLimitPercent?: string | null;
    approvalLimitPercent?: string | null;
  },
) {
  if (input.roleKey === "super_admin") requireSuperAdmin(actor);
  assertCanManageTarget(actor, input.roleKey);
  if ((input.discountLimitPercent || input.approvalLimitPercent) && !can(actor, "discounts.configure")) {
    throw forbidden("Setting discount limits requires the discount policy permission");
  }
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(input.username)) {
    throw invalid("Username: 3–40 letters, digits, dot, dash or underscore");
  }
  const security = await getSettings("security");
  const weak = checkPasswordStrength(input.temporaryPassword, { minLength: security.minPasswordLength, username: input.username });
  if (weak) throw invalid(`Temporary password: ${weak}`);
  const hash = await hashPassword(input.temporaryPassword);
  const db = getDb();
  return db.transaction(async (tx) => {
    const role = await roleByKey(tx, input.roleKey);
    const [u] = await tx
      .insert(users)
      .values({
        username: input.username.trim(),
        displayName: input.displayName.trim(),
        mobile: input.mobile || null,
        email: input.email || null,
        passwordHash: hash,
        roleId: role.id,
        mustChangePassword: true,
        discountLimitPercent: validLimit(input.discountLimitPercent),
        approvalLimitPercent: validLimit(input.approvalLimitPercent),
        createdBy: actor.id,
      })
      .returning({ id: users.id });
    await audit(tx, auditActorOf(actor), {
      action: "user.create",
      entityType: "user",
      entityId: u.id,
      summary: `Created staff account "${input.username}" (${role.name})`,
      data: { role: role.key, discountLimit: input.discountLimitPercent ?? null, approvalLimit: input.approvalLimitPercent ?? null },
    });
    return { id: u.id };
  });
}

export async function updateStaff(
  actor: Actor,
  userId: string,
  input: {
    displayName?: string;
    mobile?: string | null;
    email?: string | null;
    isActive?: boolean;
    roleKey?: string;
    discountLimitPercent?: string | null;
    approvalLimitPercent?: string | null;
  },
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const { u, r } = await targetUser(tx, userId);
    assertCanManageTarget(actor, r.key, userId);
    if (r.key === "super_admin") requireSuperAdmin(actor);
    if (input.isActive === true && !u.isActive) await assertMayManageElevated(tx, actor, u, r);

    const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    const changes: Record<string, unknown> = {};

    if (input.displayName !== undefined && input.displayName.trim() !== u.displayName) {
      set.displayName = input.displayName.trim();
      changes.displayName = { from: u.displayName, to: set.displayName };
    }
    if (input.mobile !== undefined && input.mobile !== u.mobile) {
      set.mobile = input.mobile || null;
      changes.mobile = { from: u.mobile, to: set.mobile };
    }
    if (input.email !== undefined && input.email !== u.email) {
      set.email = input.email || null;
      changes.email = { from: u.email, to: set.email };
    }

    let newRoleKey = r.key;
    if (input.roleKey !== undefined && input.roleKey !== r.key) {
      requireSuperAdmin(actor); // only the Super Admin assigns roles (incl. granting/revoking Super Admin)
      const newRole = await roleByKey(tx, input.roleKey);
      if (r.key === "super_admin" && (await activeSuperAdminCount(tx)) <= 1) {
        throw conflict("Cannot remove the last active Super Admin");
      }
      set.roleId = newRole.id;
      newRoleKey = newRole.key;
      changes.role = { from: r.key, to: newRole.key };
    }

    if (input.isActive !== undefined && input.isActive !== u.isActive) {
      if (!input.isActive && r.key === "super_admin" && (await activeSuperAdminCount(tx)) <= 1) {
        throw conflict("Cannot deactivate the last active Super Admin");
      }
      set.isActive = input.isActive;
      changes.isActive = { from: u.isActive, to: input.isActive };
    }

    for (const key of ["discountLimitPercent", "approvalLimitPercent"] as const) {
      if (input[key] !== undefined && validLimit(input[key]) !== u[key]) {
        if (!can(actor, "discounts.configure")) throw forbidden("Changing discount limits requires the discount policy permission");
        set[key] = validLimit(input[key]);
        changes[key] = { from: u[key], to: set[key] };
      }
    }

    if (Object.keys(changes).length === 0) return { changed: false };
    await tx.update(users).set(set).where(eq(users.id, userId));
    if (set.isActive === false || set.roleId) await revokeUserSessions(tx, userId);
    await audit(tx, auditActorOf(actor), {
      action: changes.role ? "user.role_change" : set.isActive === false ? "user.deactivate" : "user.update",
      entityType: "user",
      entityId: userId,
      summary: `Updated staff account "${u.username}"${changes.role ? ` (role ${r.key} → ${newRoleKey})` : ""}`,
      data: { changes },
    });
    return { changed: true };
  });
}

export async function resetStaffPassword(actor: Actor, userId: string, temporaryPassword: string) {
  const security = await getSettings("security");
  const db = getDb();
  return db.transaction(async (tx) => {
    const { u, r } = await targetUser(tx, userId);
    assertCanManageTarget(actor, r.key, userId);
    if (r.key === "super_admin") requireSuperAdmin(actor);
    await assertMayManageElevated(tx, actor, u, r);
    const weak = checkPasswordStrength(temporaryPassword, { minLength: security.minPasswordLength, username: u.username });
    if (weak) throw invalid(`Temporary password: ${weak}`);
    await tx
      .update(users)
      .set({
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    await revokeUserSessions(tx, userId);
    await audit(tx, auditActorOf(actor), {
      action: "user.password_reset",
      entityType: "user",
      entityId: userId,
      summary: `Reset password for "${u.username}" (must change at next sign-in)`,
    });
  });
}

/** Per-user grant/deny overrides. Super Admin only; cannot target Super Admins. */
export async function setPermissionOverrides(
  actor: Actor,
  userId: string,
  overrides: { permission: string; effect: "grant" | "deny" }[],
) {
  requireSuperAdmin(actor);
  for (const o of overrides) {
    if (!isPermission(o.permission) || SUPER_ADMIN_ONLY.includes(o.permission)) {
      throw invalid(`Unknown or non-assignable permission "${o.permission}"`);
    }
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    const { u, r } = await targetUser(tx, userId);
    if (r.key === "super_admin") throw invalid("Super Admins always hold every permission");
    const before = await tx.select().from(userPermissionOverrides).where(eq(userPermissionOverrides.userId, userId));
    await tx.delete(userPermissionOverrides).where(eq(userPermissionOverrides.userId, userId));
    const unique = new Map(overrides.map((o) => [o.permission, o.effect]));
    if (unique.size) {
      await tx.insert(userPermissionOverrides).values(
        [...unique].map(([permission, effect]) => ({ userId, permission, effect, grantedBy: actor.id })),
      );
    }
    await audit(tx, auditActorOf(actor), {
      action: "user.permissions_change",
      entityType: "user",
      entityId: userId,
      summary: `Changed individual permissions for "${u.username}"`,
      data: {
        before: before.map((b) => `${b.effect}:${b.permission}`).sort(),
        after: [...unique].map(([p, e]) => `${e}:${p}`).sort(),
      },
    });
  });
}

/** Edit a role's permission template. Super Admin only; the super_admin role is not editable. */
export async function setRolePermissions(
  actor: Actor,
  roleKey: string,
  input: { permissions: string[]; discountLimitPercent?: string; approvalLimitPercent?: string },
) {
  requireSuperAdmin(actor);
  if (roleKey === "super_admin") throw invalid("The Super Admin role always holds every permission");
  for (const p of input.permissions) {
    if (!isPermission(p) || SUPER_ADMIN_ONLY.includes(p)) throw invalid(`Unknown or non-assignable permission "${p}"`);
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    const role = await roleByKey(tx, roleKey);
    const before = await tx.select().from(rolePermissions).where(eq(rolePermissions.roleId, role.id));
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
    const perms = [...new Set(input.permissions)] as Permission[];
    if (perms.length) await tx.insert(rolePermissions).values(perms.map((p) => ({ roleId: role.id, permission: p })));
    const set: Partial<typeof roles.$inferInsert> = { updatedAt: new Date() };
    if (input.discountLimitPercent !== undefined) set.defaultDiscountLimitPercent = validLimit(input.discountLimitPercent) ?? "0";
    if (input.approvalLimitPercent !== undefined) set.defaultApprovalLimitPercent = validLimit(input.approvalLimitPercent) ?? "0";
    await tx.update(roles).set(set).where(eq(roles.id, role.id));
    await audit(tx, auditActorOf(actor), {
      action: "role.permissions_change",
      entityType: "role",
      entityId: role.key,
      summary: `Changed permissions of role "${role.name}"`,
      data: {
        added: perms.filter((p) => !before.some((b) => b.permission === p)),
        removed: before.map((b) => b.permission).filter((p) => !perms.includes(p as Permission)),
        discountLimit: set.defaultDiscountLimitPercent,
        approvalLimit: set.defaultApprovalLimitPercent,
      },
    });
  });
}

export async function listActiveSessions(actor: Actor, userId: string) {
  if (!actor.isSuperAdmin && actor.id !== userId) throw forbidden();
  const db = getDb();
  return db
    .select({ createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, ip: sessions.ip, userAgent: sessions.userAgent, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), sql`${sessions.revokedAt} is null`, sql`${sessions.expiresAt} > now()`));
}

/** Used by the bootstrap CLI only. Refuses if a Super Admin already exists unless `allowAdditional`. */
export async function createInitialSuperAdmin(input: {
  username: string;
  displayName: string;
  password: string;
  mobile?: string;
  email?: string;
  allowAdditional?: boolean;
}) {
  const db = getDb();
  const security = await getSettings("security");
  const weak = checkPasswordStrength(input.password, { minLength: Math.max(12, security.minPasswordLength), username: input.username });
  if (weak) throw invalid(weak);
  const hash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const role = await roleByKey(tx, "super_admin");
    const existing = await tx.select({ id: users.id }).from(users).where(eq(users.roleId, role.id));
    if (existing.length && !input.allowAdditional) {
      throw new AppError("CONFLICT", "A Super Admin already exists. Use the Staff screen to manage accounts.");
    }
    const [u] = await tx
      .insert(users)
      .values({
        username: input.username,
        displayName: input.displayName,
        mobile: input.mobile ?? null,
        email: input.email ?? null,
        passwordHash: hash,
        roleId: role.id,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      })
      .returning({ id: users.id });
    await audit(tx, { userId: null, label: "cli:create-super-admin" }, {
      action: "user.create",
      entityType: "user",
      entityId: u.id,
      summary: `Created Super Admin "${input.username}" via command line`,
    });
    return u;
  });
}
