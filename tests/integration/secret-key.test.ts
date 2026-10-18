import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { loginChallenges, users } from "@/server/db/schema";
import { getSettings } from "@/server/settings";
import {
  clearLoginSecretFor,
  completeSecretLogin,
  login,
  removeLoginSecret,
  setLoginSecret,
  validateSession,
} from "@/server/services/auth";
import { createInitialSuperAdmin } from "@/server/services/users";
import { addLine, approveInPerson, createSale, getSale, updateLine } from "@/server/services/sales";
import { makeItem, makeUser, rejects, reload, sessionLogin, TEST_PASSWORD, uid } from "./helpers";

const KEY = "Gold-Key-7391";
/** A distinct client per call, so per-IP limits from other tests don't interfere. */
const freshClient = () => ({ ip: `172.16.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, userAgent: "vitest" });

async function challengeFor(username: string, password = TEST_PASSWORD) {
  const r = await login(username, password, freshClient());
  if (r.kind !== "secret_required") throw new Error("expected the secret-key step");
  return r.challenge;
}

describe("first Super Admin from the command line", () => {
  it("a password handed over in writing is temporary and must be changed at first sign-in", async () => {
    const username = uid("Kishan");
    await createInitialSuperAdmin({ username, displayName: "Kishan Suthar", password: "Handover-Temp-Pass-2026!", allowAdditional: true, temporary: true });
    const { actor } = await sessionLogin(username, "Handover-Temp-Pass-2026!", freshClient());
    expect(actor.isSuperAdmin).toBe(true);
    expect(actor.mustChangePassword).toBe(true);
    const { changePassword } = await import("@/server/services/auth");
    expect((await rejects(changePassword(actor, "Handover-Temp-Pass-2026!", "Short-Pas-1"))).message).toMatch(/at least 12/);
    await changePassword(actor, "Handover-Temp-Pass-2026!", "Owner-Chosen-Pass-26");
    expect((await reload(actor)).mustChangePassword).toBe(false);
  });
});

describe("sign-in secret key", () => {
  it("after a correct password, sign-in waits for the secret key and creates no session until then", async () => {
    const yash = await makeUser("admin");
    await setLoginSecret(yash, { currentPassword: TEST_PASSWORD, newSecretKey: KEY });
    expect((await reload(yash)).hasSecretKey).toBe(true);

    const r = await login(yash.username, TEST_PASSWORD, freshClient());
    expect(r.kind).toBe("secret_required");
    expect("token" in r).toBe(false);
    // A wrong password still gets the generic error, never the secret-key step.
    expect((await rejects(login(yash.username, "Wrong-Pass-123", freshClient()))).message).toBe("Invalid username or password");

    const challenge = (r as { challenge: string }).challenge;
    expect((await rejects(completeSecretLogin(challenge, "Wrong-Key-1", freshClient()))).message).toBe("Secret key is incorrect");
    const { token, actor } = await completeSecretLogin(challenge, KEY, freshClient());
    expect(actor.id).toBe(yash.id);
    expect((await validateSession(token))?.userId).toBe(yash.id);
    // Single use: the same challenge can't open a second session.
    expect((await rejects(completeSecretLogin(challenge, KEY, freshClient()))).message).toMatch(/expired/);
  });

  it("allows 3 tries per sign-in, expires after 5 minutes, and wrong keys count towards account lockout", async () => {
    const u = await makeUser("admin");
    await setLoginSecret(u, { currentPassword: TEST_PASSWORD, newSecretKey: KEY });

    const c1 = await challengeFor(u.username);
    await rejects(completeSecretLogin(c1, "Wrong-Key-1", freshClient()));
    await rejects(completeSecretLogin(c1, "Wrong-Key-2", freshClient()));
    expect((await rejects(completeSecretLogin(c1, "Wrong-Key-3", freshClient()))).message).toMatch(/Too many tries/);
    expect((await rejects(completeSecretLogin(c1, KEY, freshClient()))).message).toMatch(/expired/);

    const c2 = await challengeFor(u.username);
    await getDb().update(loginChallenges).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(loginChallenges.userId, u.id));
    expect((await rejects(completeSecretLogin(c2, KEY, freshClient()))).message).toMatch(/expired/);

    // 3 wrong keys above + 2 more = 5 failures → locked, even with the right password and key.
    const max = (await getSettings("security")).maxFailedLogins;
    const c3 = await challengeFor(u.username);
    for (let i = 3; i < max; i++) await rejects(completeSecretLogin(c3, `Wrong-Key-${i}x`, freshClient()));
    const [row] = await getDb().select().from(users).where(eq(users.id, u.id));
    expect(row.lockedUntil && row.lockedUntil > new Date()).toBe(true);
    expect((await rejects(login(u.username, TEST_PASSWORD, freshClient()))).message).toMatch(/locked/);
  });

  it("adding a key needs the current password, must differ from the password, and signs out other sessions", async () => {
    const u = await makeUser("admin");
    const other = await sessionLogin(u.username, TEST_PASSWORD, freshClient());
    expect((await rejects(setLoginSecret(u, { currentPassword: "Wrong-Pass-123", newSecretKey: KEY }))).message).toMatch(/Current password is incorrect/);
    expect((await rejects(setLoginSecret(u, { currentPassword: TEST_PASSWORD, newSecretKey: TEST_PASSWORD }))).message).toMatch(/different from your password/);
    expect((await rejects(setLoginSecret(u, { currentPassword: TEST_PASSWORD, newSecretKey: "short" }))).message).toMatch(/at least 8/);
    await setLoginSecret(u, { currentPassword: TEST_PASSWORD, newSecretKey: KEY });
    expect(await validateSession(other.token)).toBeNull();
    // Changing or removing it needs the current key too.
    const withKey = await reload(u);
    expect((await rejects(setLoginSecret(withKey, { currentPassword: TEST_PASSWORD, newSecretKey: "New-Key-5521" }))).message).toMatch(/Current secret key is incorrect/);
    expect((await rejects(removeLoginSecret(withKey, { currentPassword: TEST_PASSWORD, currentSecretKey: "Wrong-Key-1" }))).message).toMatch(/Current secret key is incorrect/);
    await removeLoginSecret(withKey, { currentPassword: TEST_PASSWORD, currentSecretKey: KEY });
    expect((await login(u.username, TEST_PASSWORD, freshClient())).kind).toBe("session");
  });

  it("only the Super Admin can clear someone else's forgotten key", async () => {
    const kishan = await makeUser("super_admin");
    const yash = await makeUser("admin");
    const vikram = await makeUser("admin");
    await setLoginSecret(vikram, { currentPassword: TEST_PASSWORD, newSecretKey: KEY });
    expect((await rejects(clearLoginSecretFor(yash, vikram.id))).message).toMatch(/Only the Super Admin/);
    await clearLoginSecretFor(kishan, vikram.id);
    expect((await login(vikram.username, TEST_PASSWORD, freshClient())).kind).toBe("session");
  });

  it("an approver with a secret key must also give it for an in-person approval", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    await setLoginSecret(kishan, { currentPassword: TEST_PASSWORD, newSecretKey: KEY });
    const item = await makeItem(kishan, { price: "1000", cost: "300" });
    const sale = await createSale(sachin);
    await addLine(sachin, sale.id, { variantId: item.variantId, quantity: "1" });
    const { lines } = await getSale(sachin, sale.id);
    await updateLine(sachin, sale.id, lines[0].id, { discount: { type: "percent", value: "8" }, discountReason: "contractor" });
    const name = (await reload(kishan)).username;
    expect((await rejects(approveInPerson(sachin, sale.id, name, TEST_PASSWORD, null, freshClient()))).message).toMatch(/secret key is incorrect/);
    const ok = await approveInPerson(sachin, sale.id, name, TEST_PASSWORD, null, freshClient(), KEY);
    expect(ok).toBeTruthy();
    expect((await getSale(sachin, sale.id)).sale.approvalStatus).toBe("approved");
  });
});
