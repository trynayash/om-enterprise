import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { auditLogs, users } from "@/server/db/schema";
import { can } from "@/server/auth/actor";
import { changePassword, login, validateSession, actorFromToken } from "@/server/services/auth";
import {
  createInitialSuperAdmin,
  createStaff,
  resetStaffPassword,
  setPermissionOverrides,
  setRolePermissions,
  updateStaff,
} from "@/server/services/users";
import { client, makeUser, rejects, reload, TEST_PASSWORD, uid } from "./helpers";

describe("roles & permissions", () => {
  it("Super Admin (Kishan) holds every permission", async () => {
    const kishan = await makeUser("super_admin", { displayName: "Kishan Suthar" });
    expect(kishan.isSuperAdmin).toBe(true);
    for (const p of ["prices.approve", "costs.edit", "settings.tax", "discounts.configure", "audit.view", "users.manage"] as const) {
      expect(can(kishan, p)).toBe(true);
    }
  });

  it("Admins (Yash, Vikram) get operational defaults but not master-price, cost, tax or policy powers", async () => {
    const yash = await makeUser("admin", { displayName: "Yash" });
    expect(can(yash, "catalog.edit")).toBe(true);
    expect(can(yash, "prices.edit")).toBe(true);
    expect(can(yash, "reports.view")).toBe(true);
    expect(can(yash, "prices.approve")).toBe(false);
    expect(can(yash, "costs.edit")).toBe(false);
    expect(can(yash, "settings.tax")).toBe(false);
    expect(can(yash, "discounts.configure")).toBe(false);
    expect(can(yash, "users.manage")).toBe(false);
  });

  it("Sales (Sachin) can sell and bill but cannot see costs or edit prices", async () => {
    const sachin = await makeUser("sales", { displayName: "Sachin" });
    for (const p of ["sales.create", "discounts.apply", "payments.record", "payments.verify", "documents.issue"] as const) {
      expect(can(sachin, p)).toBe(true);
    }
    for (const p of ["prices.edit", "costs.view", "catalog.edit", "settings.tax", "sales.view_all"] as const) {
      expect(can(sachin, p)).toBe(false);
    }
    expect(sachin.discountLimitPercent).toBe("5.00");
  });

  it("Super Admin can configure each admin individually", async () => {
    const kishan = await makeUser("super_admin");
    const yash = await makeUser("admin", { displayName: "Yash" });
    const vikram = await makeUser("admin", { displayName: "Vikram Uncle" });
    await setPermissionOverrides(kishan, yash.id, [
      { permission: "prices.approve", effect: "grant" },
      { permission: "costs.edit", effect: "grant" },
    ]);
    await setPermissionOverrides(kishan, vikram.id, [{ permission: "reports.profit", effect: "deny" }]);
    const y = await reload(yash);
    const v = await reload(vikram);
    expect(can(y, "prices.approve")).toBe(true);
    expect(can(y, "costs.edit")).toBe(true);
    expect(can(v, "prices.approve")).toBe(false);
    expect(can(v, "reports.profit")).toBe(false);
    expect(can(v, "reports.view")).toBe(true);
  });
});

describe("privilege escalation guards", () => {
  it("an admin cannot grant themselves or others permissions, or assign roles", async () => {
    const yash = await makeUser("admin");
    const sachin = await makeUser("sales");
    expect((await rejects(setPermissionOverrides(yash, yash.id, [{ permission: "prices.approve", effect: "grant" }]))).message).toMatch(/Super Admin/);
    expect((await rejects(setPermissionOverrides(yash, sachin.id, [{ permission: "costs.view", effect: "grant" }]))).message).toMatch(/Super Admin/);
    expect((await rejects(setRolePermissions(yash, "sales", { permissions: ["costs.view"] }))).message).toMatch(/Super Admin/);
  });

  it("an admin with users.manage can manage sales staff only — never admins or the Super Admin", async () => {
    const kishan = await makeUser("super_admin");
    const yash = await makeUser("admin");
    await setPermissionOverrides(kishan, yash.id, [{ permission: "users.manage", effect: "grant" }]);
    const y = await reload(yash);
    const created = await createStaff(y, {
      username: uid("sales"),
      displayName: "New counter staff",
      roleKey: "sales",
      temporaryPassword: "Counter-Start-2026",
    });
    expect(created.id).toBeTruthy();
    expect((await rejects(createStaff(y, { username: uid("adm"), displayName: "X", roleKey: "admin", temporaryPassword: "Counter-Start-2026" }))).message).toMatch(/Super Admin/);
    expect((await rejects(createStaff(y, { username: uid("sa"), displayName: "X", roleKey: "super_admin", temporaryPassword: "Counter-Start-2026" }))).message).toMatch(/Super Admin/);
    expect((await rejects(updateStaff(y, kishan.id, { isActive: false }))).message).toMatch(/Super Admin/);
    expect((await rejects(updateStaff(y, created.id, { roleKey: "admin" }))).message).toMatch(/Super Admin/);
    expect((await rejects(resetStaffPassword(y, kishan.id, "Another-Pass-2026"))).message).toMatch(/Super Admin/);
  });

  it("nobody can change their own access, and admins cannot make themselves Super Admin", async () => {
    const yash = await makeUser("admin");
    expect((await rejects(updateStaff(yash, yash.id, { roleKey: "super_admin" }))).message).toMatch(/own account/);
    const kishan = await makeUser("super_admin");
    expect((await rejects(updateStaff(kishan, kishan.id, { isActive: false }))).message).toMatch(/own account/);
  });

  it("only the Super Admin grants Super Admin, and the last active Super Admin is protected", async () => {
    const db = getDb();
    const kishan = await makeUser("super_admin");
    const yash = await makeUser("admin");
    await updateStaff(kishan, yash.id, { roleKey: "super_admin" });
    expect((await reload(yash)).isSuperAdmin).toBe(true);
    await updateStaff(kishan, yash.id, { roleKey: "admin" });
    expect((await reload(yash)).isSuperAdmin).toBe(false);

    // Leave exactly two active Super Admins: kishan and second.
    const second = await makeUser("super_admin");
    const superRoleId = (await db.select({ roleId: users.roleId }).from(users).where(eq(users.id, kishan.id)))[0].roleId;
    const all = await db.select().from(users).where(eq(users.roleId, superRoleId));
    for (const u of all) {
      if (u.id !== kishan.id && u.id !== second.id) await db.update(users).set({ isActive: false }).where(eq(users.id, u.id));
    }
    await updateStaff(kishan, second.id, { isActive: false }); // 2 → 1 active: allowed
    // A stale session of the now-inactive second admin must not be able to remove the last one.
    const err = await rejects(updateStaff(second, kishan.id, { isActive: false }));
    expect(err.message).toMatch(/last active Super Admin/);
    const err2 = await rejects(updateStaff(second, kishan.id, { roleKey: "admin" }));
    expect(err2.message).toMatch(/last active Super Admin/);
    // restore for other tests
    await db.update(users).set({ isActive: true }).where(eq(users.roleId, superRoleId));
  });

  it("the CLI refuses to create a second Super Admin unless explicitly asked", async () => {
    await makeUser("super_admin");
    const err = await rejects(createInitialSuperAdmin({ username: uid("boot"), displayName: "Boot", password: "Very-Strong-Pass-2026" }));
    expect(err.message).toMatch(/already exists/);
  });
});

describe("authentication", () => {
  it("logs in, validates the session, and audits the sign-in", async () => {
    const sachin = await makeUser("sales");
    const { token } = await login(sachin.username, TEST_PASSWORD, client);
    const session = await validateSession(token);
    expect(session?.userId).toBe(sachin.id);
    const actor = await actorFromToken(token);
    expect(actor?.id).toBe(sachin.id);
    const logs = await getDb().select().from(auditLogs).where(eq(auditLogs.entityId, sachin.id));
    expect(logs.some((l) => l.action === "auth.login")).toBe(true);
  });

  it("is case-insensitive on username but rejects wrong passwords with a generic message", async () => {
    const sachin = await makeUser("sales");
    await expect(login(sachin.username.toUpperCase(), TEST_PASSWORD, client)).resolves.toBeTruthy();
    const e = await rejects(login(sachin.username, "wrong-password-1", client));
    expect(e.message).toBe("Invalid username or password");
    const e2 = await rejects(login("no-such-user-xyz", "whatever-1", client));
    expect(e2.message).toBe("Invalid username or password");
  });

  it("locks the account after repeated failures", async () => {
    const u = await makeUser("sales");
    for (let i = 0; i < 5; i++) await rejects(login(u.username, "bad-password-1", client));
    const e = await rejects(login(u.username, TEST_PASSWORD, client));
    expect(e.message).toMatch(/locked/);
  });

  it("refuses deactivated accounts and revokes their sessions", async () => {
    const kishan = await makeUser("super_admin");
    const u = await makeUser("sales");
    const { token } = await login(u.username, TEST_PASSWORD, client);
    await updateStaff(kishan, u.id, { isActive: false });
    expect(await validateSession(token)).toBeNull();
    expect((await rejects(login(u.username, TEST_PASSWORD, client))).message).toBe("Invalid username or password");
  });

  it("password change enforces strength and signs out other sessions", async () => {
    const u = await makeUser("sales");
    const a = await login(u.username, TEST_PASSWORD, client);
    const b = await login(u.username, TEST_PASSWORD, client);
    expect((await rejects(changePassword(u, TEST_PASSWORD, "short"))).message).toMatch(/at least/);
    await changePassword(u, TEST_PASSWORD, "Brand-New-Secret-77", a.token);
    expect(await validateSession(a.token)).not.toBeNull();
    expect(await validateSession(b.token)).toBeNull();
    await expect(login(u.username, "Brand-New-Secret-77", client)).resolves.toBeTruthy();
  });

  it("a reset password must be changed at next sign-in", async () => {
    const kishan = await makeUser("super_admin");
    const u = await makeUser("sales");
    await resetStaffPassword(kishan, u.id, "Temp-Reset-Pass-42");
    const { actor } = await login(u.username, "Temp-Reset-Pass-42", client);
    expect(actor.mustChangePassword).toBe(true);
  });
});
