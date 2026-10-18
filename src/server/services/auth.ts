import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { getDb, type Tx } from "@/server/db/client";
import { loginChallenges, sessions, users } from "@/server/db/schema";
import { audit, type AuditActor } from "@/server/audit";
import { AppError, invalid } from "@/server/errors";
import { getSettings } from "@/server/settings";
import { checkPasswordStrength, getDummyHash, hashPassword, verifyPassword } from "@/server/auth/password";
import { loadActor, requireSuperAdmin, type Actor, auditActorOf } from "@/server/auth/actor";
import { enforceRateLimit } from "@/server/rate-limit";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Count a wrong password against the account and lock it after too many in a row.
 * Shared by sign-in and in-person approval, so neither can be used to guess a password freely.
 */
async function registerWrongPassword(tx: Tx, user: typeof users.$inferSelect, who: AuditActor, summary: string) {
  const security = await getSettings("security", tx);
  const now = new Date();
  // Re-read under lock so concurrent failures are all counted.
  const [current] = await tx.select({ failed: users.failedLoginCount }).from(users).where(eq(users.id, user.id)).for("update");
  const failed = (current?.failed ?? user.failedLoginCount) + 1;
  const lock = failed >= security.maxFailedLogins;
  await tx
    .update(users)
    .set({
      failedLoginCount: lock ? 0 : failed,
      lockedUntil: lock ? new Date(now.getTime() + security.lockoutMinutes * 60000) : user.lockedUntil,
    })
    .where(eq(users.id, user.id));
  await audit(tx, who, {
    action: lock ? "auth.account_locked" : who.label.startsWith("approver") ? "auth.approver_check_failed" : "auth.login_failed",
    entityType: "user",
    entityId: user.id,
    summary: lock ? `Account locked after ${failed} wrong passwords` : summary,
  });
}

interface ClientInfo {
  ip: string;
  userAgent: string;
}

const GENERIC_LOGIN_ERROR = "Invalid username or password";

/** Minutes a correct password stays valid while the secret key is entered, and tries allowed. */
const CHALLENGE_MINUTES = 5;
const CHALLENGE_MAX_ATTEMPTS = 3;
const SECRET_MIN_LENGTH = 8;

export type LoginResult =
  | { kind: "session"; token: string; expiresAt: Date; actor: Actor }
  | { kind: "secret_required"; challenge: string; expiresAt: Date };

async function enforceLoginIpLimit(client: ClientInfo) {
  const ipLimit = Number(process.env.LOGIN_RATE_LIMIT_PER_15MIN ?? 30);
  await enforceRateLimit(`login:ip:${client.ip}`, ipLimit, 15 * 60, "Too many sign-in attempts from this device. Wait 15 minutes.");
}

/** Create a session for a fully authenticated user. `challengeId` is consumed atomically (single use). */
async function startSession(user: typeof users.$inferSelect, client: ClientInfo, summary: string, challengeId?: string) {
  const db = getDb();
  const security = await getSettings("security");
  const now = new Date();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + security.sessionMaxHours * 3600_000);
  await db.transaction(async (tx) => {
    if (challengeId) {
      const used = await tx.delete(loginChallenges).where(eq(loginChallenges.id, challengeId)).returning({ id: loginChallenges.id });
      if (!used.length) throw new AppError("UNAUTHENTICATED", CHALLENGE_EXPIRED);
    }
    await tx.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now }).where(eq(users.id, user.id));
    await tx.insert(sessions).values({
      id: hashToken(token),
      userId: user.id,
      expiresAt,
      ip: client.ip,
      userAgent: client.userAgent.slice(0, 300),
    });
    await audit(tx, { userId: user.id, label: user.displayName, ip: client.ip, userAgent: client.userAgent }, {
      action: "auth.login",
      entityType: "user",
      entityId: user.id,
      summary,
    });
  });
  const actor = await loadActor(user.id);
  if (!actor) throw new AppError("UNAUTHENTICATED", GENERIC_LOGIN_ERROR);
  return { token, expiresAt, actor };
}

const CHALLENGE_EXPIRED = "This sign-in has expired. Enter your username and password again.";

/**
 * Step 1 of sign-in. Without a secret key this creates the session; with one, the correct password
 * only earns a short-lived, single-use challenge for step 2 (`completeSecretLogin`).
 */
export async function login(username: string, password: string, client: ClientInfo): Promise<LoginResult> {
  const db = getDb();
  const uname = username.trim();
  await enforceLoginIpLimit(client);

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
        await registerWrongPassword(tx, user, { ...anon, userId: user.id }, "Sign-in failed: wrong password");
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

  if (user.loginSecretHash) {
    const challenge = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + CHALLENGE_MINUTES * 60_000);
    await db.transaction(async (tx) => {
      // One pending sign-in per account; expired ones are cleared as we go.
      await tx.delete(loginChallenges).where(eq(loginChallenges.userId, user.id));
      await tx.insert(loginChallenges).values({ id: hashToken(challenge), userId: user.id, expiresAt, ip: client.ip });
      await audit(tx, { ...anon, userId: user.id }, {
        action: "auth.password_ok",
        entityType: "user",
        entityId: user.id,
        summary: "Password correct — waiting for the secret key",
      });
    });
    return { kind: "secret_required", challenge, expiresAt };
  }
  return { kind: "session", ...(await startSession(user, client, "Signed in")) };
}

/** Step 2 of sign-in for accounts with a secret key. Wrong keys count towards account lockout. */
export async function completeSecretLogin(challenge: string, secretKey: string, client: ClientInfo): Promise<{ token: string; expiresAt: Date; actor: Actor }> {
  await enforceLoginIpLimit(client);
  const expired = new AppError("UNAUTHENTICATED", CHALLENGE_EXPIRED);
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(challenge)) throw expired;
  const db = getDb();
  const id = hashToken(challenge);
  const [c] = await db.select().from(loginChallenges).where(eq(loginChallenges.id, id));
  const now = new Date();
  if (!c) throw expired;
  const [user] = await db.select().from(users).where(eq(users.id, c.userId));
  if (c.expiresAt <= now || !user || !user.isActive || !user.loginSecretHash) {
    await db.delete(loginChallenges).where(eq(loginChallenges.id, id));
    throw expired;
  }
  if (user.lockedUntil && user.lockedUntil > now) {
    await db.delete(loginChallenges).where(eq(loginChallenges.id, id));
    const mins = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000);
    throw new AppError("RATE_LIMITED", `Account temporarily locked after failed attempts. Try again in ${mins} min.`);
  }
  if (!(await verifyPassword(secretKey, user.loginSecretHash))) {
    const attempts = c.attempts + 1;
    await db.transaction(async (tx) => {
      if (attempts >= CHALLENGE_MAX_ATTEMPTS) await tx.delete(loginChallenges).where(eq(loginChallenges.id, id));
      else await tx.update(loginChallenges).set({ attempts }).where(eq(loginChallenges.id, id));
      const who: AuditActor = { userId: user.id, label: `login:${user.username}`, ip: client.ip, userAgent: client.userAgent };
      await registerWrongPassword(tx, user, who, "Sign-in failed: wrong secret key");
    });
    throw new AppError(
      "UNAUTHENTICATED",
      attempts >= CHALLENGE_MAX_ATTEMPTS ? "Secret key is incorrect. Too many tries — sign in again." : "Secret key is incorrect",
    );
  }
  return startSession(user, client, "Signed in (password + secret key)", id);
}

/* ------------------------------------------------------------------ */
/* Secret key management                                               */
/* ------------------------------------------------------------------ */

async function checkOwnCredentials(tx: Tx, actor: Actor, user: typeof users.$inferSelect, currentPassword: string, currentSecretKey?: string | null) {
  const who = { ...auditActorOf(actor), label: `account:${user.username}` };
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    await registerWrongPassword(tx, user, who, "Secret key change refused: wrong current password");
    return "Current password is incorrect";
  }
  if (user.loginSecretHash && !(currentSecretKey && (await verifyPassword(currentSecretKey, user.loginSecretHash)))) {
    await registerWrongPassword(tx, user, who, "Secret key change refused: wrong current secret key");
    return "Current secret key is incorrect";
  }
  return null;
}

/** Add or change the caller's secret key. Other sessions are signed out. */
export async function setLoginSecret(
  actor: Actor,
  input: { currentPassword: string; currentSecretKey?: string | null; newSecretKey: string },
  currentToken?: string,
) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, actor.id));
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in");
  const weak = checkPasswordStrength(input.newSecretKey, { minLength: SECRET_MIN_LENGTH, username: user.username });
  if (weak) throw invalid(weak.replace(/Password/g, "Secret key").replace(/password/g, "secret key"));
  if (await verifyPassword(input.newSecretKey, user.passwordHash)) throw invalid("The secret key must be different from your password");
  const hash = await hashPassword(input.newSecretKey);
  const problem = await db.transaction(async (tx) => {
    const p = await checkOwnCredentials(tx, actor, user, input.currentPassword, input.currentSecretKey);
    if (p) return p;
    await tx.update(users).set({ loginSecretHash: hash, loginSecretSetAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
    await tx.delete(loginChallenges).where(eq(loginChallenges.userId, user.id));
    await revokeUserSessions(tx, user.id, currentToken ? hashToken(currentToken) : undefined);
    await audit(tx, auditActorOf(actor), {
      action: user.loginSecretHash ? "auth.secret_key_changed" : "auth.secret_key_added",
      entityType: "user",
      entityId: user.id,
      summary: `${user.loginSecretHash ? "Changed" : "Added"} sign-in secret key (other sessions signed out)`,
    });
    return null;
  });
  if (problem) throw invalid(problem);
}

/** Remove the caller's secret key (needs the current password and secret key). */
export async function removeLoginSecret(actor: Actor, input: { currentPassword: string; currentSecretKey: string }) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, actor.id));
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in");
  if (!user.loginSecretHash) throw invalid("No secret key is set");
  const problem = await db.transaction(async (tx) => {
    const p = await checkOwnCredentials(tx, actor, user, input.currentPassword, input.currentSecretKey);
    if (p) return p;
    await tx.update(users).set({ loginSecretHash: null, loginSecretSetAt: null, updatedAt: new Date() }).where(eq(users.id, user.id));
    await audit(tx, auditActorOf(actor), { action: "auth.secret_key_removed", entityType: "user", entityId: user.id, summary: "Removed sign-in secret key" });
    return null;
  });
  if (problem) throw invalid(problem);
}

/** Super Admin: clear another staff member's forgotten secret key (they can then add a new one). */
export async function clearLoginSecretFor(actor: Actor, userId: string) {
  requireSuperAdmin(actor);
  if (userId === actor.id) throw invalid("Use Account → Security to change your own secret key");
  const db = getDb();
  await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!user) throw new AppError("NOT_FOUND", "Staff member not found");
    if (!user.loginSecretHash) throw invalid("This account has no secret key");
    await tx.update(users).set({ loginSecretHash: null, loginSecretSetAt: null, updatedAt: new Date() }).where(eq(users.id, userId));
    await tx.delete(loginChallenges).where(eq(loginChallenges.userId, userId));
    await audit(tx, auditActorOf(actor), { action: "auth.secret_key_cleared", entityType: "user", entityId: userId, summary: `Cleared the sign-in secret key of ${user.displayName}` });
  });
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
  // The owner's account guards everything: at least 12 characters, whatever the general minimum.
  const minLength = actor.isSuperAdmin ? Math.max(12, security.minPasswordLength) : security.minPasswordLength;
  const weak = checkPasswordStrength(newPassword, { minLength, username: user.username });
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
 * Rate limited per device, per requesting cashier and per approver account; wrong passwords count
 * towards the approver's account lockout exactly like failed sign-ins. Failures are audited.
 */
export async function verifyApproverCredentials(
  username: string,
  password: string,
  client: ClientInfo,
  requestedBy: Actor,
  secretKey?: string | null,
): Promise<Actor> {
  const uname = username.trim().toLowerCase();
  const tooMany = "Too many approval attempts. Wait 15 minutes.";
  await enforceRateLimit(`approver:ip:${client.ip}`, 10, 15 * 60, tooMany);
  await enforceRateLimit(`approver:by:${requestedBy.id}`, 5, 15 * 60, tooMany);
  await enforceRateLimit(`approver:target:${uname.slice(0, 60)}`, 5, 15 * 60, tooMany);
  const db = getDb();
  const rows = await db.select().from(users).where(sql`lower(${users.username}) = ${uname}`);
  const user = rows[0];
  const who: AuditActor = { userId: requestedBy.id, label: `approver:${uname.slice(0, 40)}`, ip: client.ip, userAgent: client.userAgent };
  const fail = () => new AppError("UNAUTHENTICATED", "Approver username, password or secret key is incorrect");
  if (!user) {
    await verifyPassword(password, await getDummyHash()); // equalise timing
    await db.transaction((tx) => audit(tx, who, { action: "auth.approver_check_failed", summary: "In-person approval: unknown approver username" }));
    throw fail();
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError("RATE_LIMITED", "That approver account is temporarily locked after wrong passwords. Use a remote approval request instead.");
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await db.transaction((tx) => registerWrongPassword(tx, user, who, `In-person approval: wrong password for ${user.displayName}`));
    throw fail();
  }
  // An approver with a secret key must give it at the counter too, or the password alone would do.
  if (user.loginSecretHash && !(secretKey && (await verifyPassword(secretKey, user.loginSecretHash)))) {
    await db.transaction((tx) => registerWrongPassword(tx, user, who, `In-person approval: wrong or missing secret key for ${user.displayName}`));
    throw fail();
  }
  if (!user.isActive) {
    await db.transaction((tx) => audit(tx, who, { action: "auth.approver_check_failed", entityType: "user", entityId: user.id, summary: "In-person approval: approver account is deactivated" }));
    throw fail();
  }
  if (user.failedLoginCount > 0) await db.update(users).set({ failedLoginCount: 0 }).where(eq(users.id, user.id));
  const actor = await loadActor(user.id);
  if (!actor) throw new AppError("UNAUTHENTICATED", "Approver account is not active");
  actor.ip = client.ip;
  actor.userAgent = client.userAgent;
  return actor;
}
