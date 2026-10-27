import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { loginWithPin } from "@/server/services/auth";
import { clearStaffPin, listStaff, setStaffPin } from "@/server/services/users";
import { hashPassword } from "@/server/auth/password";
import { pinProblem } from "@/lib/staff-pin";
import { client as baseClient, makeUser, rejects } from "./helpers";

// Its own device address, so other sign-in tests in the run don't use up the per-device limit.
const client = { ...baseClient, ip: `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };

describe("counter PIN rules", () => {
  it("wants 4 to 6 digits that aren't obvious", () => {
    expect(pinProblem("4827")).toBeNull();
    expect(pinProblem("590316")).toBeNull();
    expect(pinProblem("482")).toMatch(/4 to 6 digits/);
    expect(pinProblem("48a7")).toMatch(/4 to 6 digits/);
    expect(pinProblem("0000")).toMatch(/same one repeated/);
    expect(pinProblem("1234")).toMatch(/run like 1234/);
    expect(pinProblem("6543")).toMatch(/run like 1234/);
    expect(pinProblem("2580")).toMatch(/too common/);
  });
});

describe("signing in with a counter PIN", () => {
  it("lets Sales staff sign in with their PIN once the Super Admin sets it, and not after it is removed", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    expect((await rejects(loginWithPin(sachin.username, "4827", client))).message).toBe("Invalid username or PIN");

    await setStaffPin(kishan, sachin.id, "4827");
    expect((await listStaff(kishan)).find((s) => s.id === sachin.id)?.hasPin).toBe(true);
    const ok = await loginWithPin(sachin.username.toUpperCase(), "4827", client);
    expect(ok.actor.id).toBe(sachin.id);
    expect((await rejects(loginWithPin(sachin.username, "4828", client))).message).toBe("Invalid username or PIN");

    await clearStaffPin(kishan, sachin.id);
    expect((await rejects(loginWithPin(sachin.username, "4827", client))).message).toBe("Invalid username or PIN");
  });

  it("locks the account after five wrong PINs, like wrong passwords", async () => {
    const kishan = await makeUser("super_admin");
    const u = await makeUser("sales");
    await setStaffPin(kishan, u.id, "7391");
    for (let i = 0; i < 5; i++) await rejects(loginWithPin(u.username, "1938", client));
    expect((await rejects(loginWithPin(u.username, "7391", client))).message).toMatch(/locked/);
  });

  it("is never for the Super Admin or administrators, nor an account with a secret key, nor a weak PIN", async () => {
    const kishan = await makeUser("super_admin");
    const admin = await makeUser("admin");
    expect((await rejects(setStaffPin(kishan, admin.id, "4827"))).message).toMatch(/administrators use their password/);
    const keyed = await makeUser("accountant", { loginSecretHash: await hashPassword("a-secret-key-1") });
    expect((await rejects(setStaffPin(kishan, keyed.id, "4827"))).message).toMatch(/secret key/);
    const sachin = await makeUser("sales");
    expect((await rejects(setStaffPin(kishan, sachin.id, "1111"))).message).toMatch(/same one repeated/);
    // A PIN put in the database by hand for an administrator still doesn't sign them in.
    await getDb().update(users).set({ pinHash: await hashPassword("4827") }).where(eq(users.id, admin.id));
    expect((await rejects(loginWithPin(admin.username, "4827", client))).message).toBe("Invalid username or PIN");
  });

  it("needs the right to manage staff, and nobody sets their own", async () => {
    const admin = await makeUser("admin");
    const sachin = await makeUser("sales");
    expect((await rejects(setStaffPin(admin, sachin.id, "5016"))).code).toBe("FORBIDDEN");
    expect((await rejects(setStaffPin(sachin, sachin.id, "5016"))).code).toBe("FORBIDDEN");
  });
});
