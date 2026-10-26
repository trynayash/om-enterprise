import { describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { auditLogs, sessions, users } from "@/server/db/schema";
import { hashPassword } from "@/server/auth/password";
import { resetOwnerPassword } from "@/server/services/users";
import { client, makeUser, rejects, sessionLogin, TEST_PASSWORD } from "./helpers";
import { login } from "@/server/services/auth";

const NEW = "Kite-8472-Moss-Owner";

const row = async (id: string) => (await getDb().select().from(users).where(eq(users.id, id)))[0];

describe("recovering a forgotten owner password (hosted deployment)", () => {
  it("sets the temporary password, which must be changed, and the old one stops working", async () => {
    const owner = await makeUser("super_admin");
    const before = await row(owner.id);
    const r = await resetOwnerPassword({ username: before.username.toUpperCase(), password: NEW });
    expect(r).toEqual({ status: "applied", clearedSecretKey: false });
    expect((await rejects(login(before.username, TEST_PASSWORD, client))).message).toBe("Invalid username or password");
    const signedIn = await sessionLogin(before.username, NEW);
    expect(signedIn.actor.mustChangePassword).toBe(true);
    expect((await row(owner.id)).mustChangePassword).toBe(true);
  });

  it("unlocks a locked account and signs its sessions out", async () => {
    const owner = await makeUser("super_admin");
    const u = await row(owner.id);
    await sessionLogin(u.username, TEST_PASSWORD);
    await getDb()
      .update(users)
      .set({ failedLoginCount: 5, lockedUntil: new Date(Date.now() + 3_600_000) })
      .where(eq(users.id, u.id));
    await resetOwnerPassword({ username: u.username, password: NEW });
    const after = await row(u.id);
    expect(after.lockedUntil).toBeNull();
    expect(after.failedLoginCount).toBe(0);
    expect(
      await getDb()
        .select()
        .from(sessions)
        .where(and(eq(sessions.userId, u.id), isNull(sessions.revokedAt))),
    ).toHaveLength(0);
    await sessionLogin(u.username, NEW);
  });

  it("applies once per password: the same settings left on a later deploy never overwrite the owner's own new password", async () => {
    const owner = await makeUser("super_admin");
    const u = await row(owner.id);
    expect((await resetOwnerPassword({ username: u.username, password: NEW })).status).toBe("applied");
    // The owner signs in and chooses their own password.
    const own = await hashPassword("My-Own-Password-2026!");
    await getDb().update(users).set({ passwordHash: own, mustChangePassword: false }).where(eq(users.id, u.id));
    expect((await resetOwnerPassword({ username: u.username, password: NEW })).status).toBe("already_applied");
    expect((await row(u.id)).passwordHash).toBe(own);
    await sessionLogin(u.username, "My-Own-Password-2026!");
    // A different password is a new request.
    expect((await resetOwnerPassword({ username: u.username, password: "Cedar-3391-Pearl-Owner" })).status).toBe("applied");
  });

  it("removes a forgotten secret key only when asked, and keeps no trace of the password in the audit log", async () => {
    const owner = await makeUser("super_admin");
    const u = await row(owner.id);
    await getDb()
      .update(users)
      .set({ loginSecretHash: await hashPassword("old secret key"), loginSecretSetAt: new Date() })
      .where(eq(users.id, u.id));
    await resetOwnerPassword({ username: u.username, password: NEW });
    expect((await row(u.id)).loginSecretHash).not.toBeNull();
    const r = await resetOwnerPassword({ username: u.username, password: NEW, clearSecretKey: true });
    expect(r).toEqual({ status: "applied", clearedSecretKey: true });
    expect((await row(u.id)).loginSecretHash).toBeNull();
    const logs = await getDb()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, u.id), eq(auditLogs.action, "auth.owner_password_reset")));
    expect(logs).toHaveLength(2);
    expect(JSON.stringify(logs)).not.toContain(NEW);
    // Rows come back in no particular order: one note says the key was removed, the other does not.
    expect(logs.filter((l) => /secret key removed/.test(l.summary))).toHaveLength(1);
  });

  it("refuses a weak password, an unknown account and an account that is not a Super Admin", async () => {
    const owner = await makeUser("super_admin");
    const u = await row(owner.id);
    expect((await rejects(resetOwnerPassword({ username: u.username, password: "short" }))).message).toMatch(/not accepted/);
    expect((await rejects(resetOwnerPassword({ username: u.username, password: `${u.username}-123456789` }))).message).toMatch(/username/);
    expect((await rejects(resetOwnerPassword({ username: "nobody-here", password: NEW }))).code).toBe("NOT_FOUND");
    const sales = await row((await makeUser("sales")).id);
    const err = await rejects(resetOwnerPassword({ username: sales.username, password: NEW }));
    expect(err.code).toBe("FORBIDDEN");
    expect((await row(sales.id)).passwordHash).toBe(sales.passwordHash);
  });
});
