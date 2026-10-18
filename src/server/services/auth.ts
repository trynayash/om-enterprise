import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { getDb, type Tx } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { audit, type AuditActor } from "@/server/audit";
import { AppError, invalid } from "@/server/errors";
import { getSettings } from "@/server/settings";
import { checkPasswordStrength, getDummyHash, hashPassword, verifyPassword } from "@/server/auth/password";
import { loadActor, type Actor, auditActorOf } from "@/server/auth/actor";
import { enforceRateLimit } from "@/server/rate-limit";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

interface ClientInfo {
  ip: string;
  userAgent: string;
}

const GENERIC_LOGIN_ERROR = "Invalid username or password";

export async function login(
  username: string,
  password: string,
  client: ClientInfo,
): Promise<{ token: string; expiresAt: Date; actor: Actor }> {
  const db = getDb();
  const uname = username.trim();
  const ipLimit = Number(process.env.LOGIN_RATE_LIMIT_PER_15MIN ?? 30);
  await enforceRateLimit(`login:ip:${client.ip}`, ipLimit, 15 * 60, "Too many sign-in attempts from this device. Wait 15 minutes.");

  const security = await getSettings("security");
  const rows = await db.select().from(users).where(sql`lower(${users.username}) = lower(${uname})`);
  const user = rows[0];
  const anon: AuditActor = { userId: null, label: `login:${uname.slice(0, 40)}`, ip: client.ip, userAgent: client.userAgent };

  if (!user) {
    await verifyPassword(password, await getDummyHash()); // equalise timing
    await db.transaction((tx) =>
      audit(tx, anon, { action: "auth.login_failed", summary: "Sign-in failed: unknown username" }),
    );
    throw new AppError("UNAUTHENTICATED", GENERIC_LOGIN_ERROR);
  }

  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    const mins = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000);
    throw new AppError("RATE_LIMITED", `Account temporarily locked after failed attempts. Try again in ${mins} min.`);
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok || !user.isActive) {
    await db.transaction(async (tx) => {
      if (!ok) {
        const failed = user.failedLoginCount + 1;
        const lock = failed >= security.maxFailedLogins;
        await tx
          .update(users)
          .set({
            failedLoginCount: lock ? 0 : failed,
            lockedUntil: lock ? new Date(now.getTime() + security.lockoutMinutes * 60000) : user.lockedUntil,
          })
          .where(eq(users.id, user.id));
        await audit(tx, { ...anon, userId: user.id }, {
          action: lock ? "auth.account_locked" : "auth.login_failed",
          entityType: "user",
          entityId: user.id,
          summary: lock ? `Account locked after ${failed} failed sign-ins` : "Sign-in failed: wrong password",
        });
      } else {
        await audit(tx, { ...anon, userId: user.id }, {
          action: "auth.login_failed",
          entityType: "user",
          entityId: user.id,
          summary: "Sign-in refused: account deactivated",
        });
      }
    });
    throw new AppError("UNAUTHENTICATED", GENERIC_LOGIN_ERROR);
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + security.sessionMaxHours * 3600_000);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now })
      .where(eq(users.id, user.id));
    await tx.insert(sessions).values({
      id: hashToken(token),
      userId: user.id,
      expiresAt,
      ip: client.ip,
      userAgent: client.userAgent.slice(0, 300),
    });
    await audit(tx, { ...anon, userId: user.id, label: user.displayName }, {
      action: "auth.login",
      entityType: "user",
      entityId: user.id,
      summary: "Signed in",
    });
  });
  const actor = await loadActor(user.id);
  if (!actor) throw new AppError("UNAUTHENTICATED", GENERIC_LOGIN_ERROR);
  return { token, expiresAt, actor };
}

/** Resolve a raw session token to an active user id, enforcing absolute and idle expiry. */
export async function validateSession(token: string | undefined | null): Promise<{ userId: string; sessionId: string } | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const db = getDb();
  const id = hashToken(token);
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
  const s = rows[0];
  if (!s) return null;
  const security = await getSettings("security");
  const now = Date.now();
  if (now - s.lastSeenAt.getTime() > security.sessionIdleMinutes * 60000) {
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, id));
    return null;
  }
  if (now - s.lastSeenAt.getTime() > 60_000) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, id));
  }
  return { userId: s.userId, sessionId: id };
}

export async function actorFromToken(token: string | undefined | null, client?: Partial<ClientInfo>): Promise<Actor | null> {
  const s = await validateSession(token);
  if (!s) return null;
  const actor = await loadActor(s.userId);
  if (!actor) return null;
  actor.ip = client?.ip ?? null;
  actor.userAgent = client?.userAgent ?? null;
  return actor;
}

export async function logout(token: string, actor: Actor | null) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, hashToken(token)));
    if (actor) {
      await audit(tx, auditActorOf(actor), { action: "auth.logout", entityType: "user", entityId: actor.id, summary: "Signed out" });
    }
  });
}

export async function revokeUserSessions(tx: Tx, userId: string, exceptSessionId?: string) {
  await tx
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined,
      ),
    );
}

export async function changePassword(actor: Actor, currentPassword: string, newPassword: string, currentToken?: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, actor.id));
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw invalid("Current password is incorrect");
  }
  if (currentPassword === newPassword) throw invalid("Choose a different password from the current one");
  const security = await getSettings("security");
  const weak = checkPasswordStrength(newPassword, { minLength: security.minPasswordLength, username: user.username });
  if (weak) throw invalid(weak);
  const hash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash: hash, mustChangePassword: false, passwordChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, actor.id));
    await revokeUserSessions(tx, actor.id, currentToken ? hashToken(currentToken) : undefined);
    await audit(tx, auditActorOf(actor), {
      action: "auth.password_changed",
      entityType: "user",
      entityId: actor.id,
      summary: "Changed own password (other sessions signed out)",
    });
  });
}

/**
 * Re-verify a different user's credentials at the counter (in-person approval by a manager).
 * Rate limited; failures are audited. Returns the approver as an Actor.
 */
export async function verifyApproverCredentials(username: string, password: string, client: ClientInfo): Promise<Actor> {
  await enforceRateLimit(`approver:ip:${client.ip}`, 10, 15 * 60, "Too many approval attempts. Wait 15 minutes.");
  const db = getDb();
  const rows = await db.select().from(users).where(sql`lower(${users.username}) = lower(${username.trim()})`);
  const user = rows[0];
  const ok = user ? await verifyPassword(password, user.passwordHash) : (await verifyPassword(password, await getDummyHash()), false);
  if (!user || !ok || !user.isActive || (user.lockedUntil && user.lockedUntil > new Date())) {
    await db.transaction((tx) =>
      audit(tx, { userId: user?.id ?? null, label: `approver:${username.slice(0, 40)}`, ip: client.ip }, {
        action: "auth.approver_check_failed",
        summary: "In-person approval: credential check failed",
      }),
    );
    throw new AppError("UNAUTHENTICATED", "Approver username or password is incorrect");
  }
  const actor = await loadActor(user.id);
  if (!actor) throw new AppError("UNAUTHENTICATED", "Approver account is not active");
  actor.ip = client.ip;
  actor.userAgent = client.userAgent;
  return actor;
}
