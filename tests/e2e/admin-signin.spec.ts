import { expect, test } from "@playwright/test";
import { apiCall, login, OWNER, uniq } from "./helpers";

test.describe("owner sign-in at /admin", () => {
  test("temporary password → forced change → add secret key → sign-in asks for the key after the password", async ({ page, browser }) => {
    test.skip(test.info().project.name !== "desktop", "creates a Super Admin account; runs once");
    test.setTimeout(90_000);

    // The existing owner creates a second Super Admin with a temporary password (as the handover note does).
    await login(page, OWNER.username, OWNER.password);
    const username = uniq("Kishan");
    const temp = "Handover-Temp-2026!";
    await apiCall(page, "POST", "/api/admin/staff", { username, displayName: "Kishan (e2e)", roleKey: "super_admin", temporaryPassword: temp });

    const ctx = await browser.newContext();
    const kishan = await ctx.newPage();
    await kishan.goto("/admin");
    await expect(kishan.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
    await kishan.fill("#username", username);
    await kishan.fill("#password", temp);
    await kishan.click("button[type=submit]");

    // First sign-in: the temporary password must be replaced.
    await kishan.waitForURL(/\/account\/password\?required=1/);
    const newPassword = "Kishan-Own-Pass-2026!";
    await kishan.fill("#cur", temp);
    await kishan.fill("#new", newPassword);
    await kishan.fill("#conf", newPassword);
    await kishan.getByRole("button", { name: "Save new password" }).click();

    // Then the owner is offered the secret key.
    await kishan.waitForURL(/\/account\/security\?setup=1/);
    await expect(kishan.getByRole("heading", { name: /Protect your account/ })).toBeVisible();
    const secret = "Navy-Gold-4729";
    await kishan.fill("#sk-password", newPassword);
    await kishan.fill("#sk-new", secret);
    await kishan.fill("#sk-confirm", secret);
    await kishan.getByRole("button", { name: "Add secret key" }).click();
    await expect(kishan.getByText(/Secret key added/)).toBeVisible();
    await kishan.waitForURL(/\/dashboard$/);

    // Sign out, then sign in again: the key is asked only after a correct password.
    await apiCall(kishan, "POST", "/api/auth/logout", {});
    await kishan.goto("/admin");
    await kishan.fill("#username", username);
    await kishan.fill("#password", newPassword);
    await kishan.click("button[type=submit]");
    await expect(kishan.locator("#secret-key")).toBeVisible();
    await expect(kishan.getByText(/Password accepted/)).toBeVisible();
    await kishan.fill("#secret-key", "Wrong-Key-0000");
    await kishan.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(kishan.getByText("Secret key is incorrect")).toBeVisible();
    // No session yet: staff pages still send us to sign in.
    const blocked = await kishan.request.get("/api/auth/me");
    expect(blocked.status()).toBe(401);
    await kishan.fill("#secret-key", secret);
    await kishan.getByRole("button", { name: "Verify and sign in" }).click();
    await kishan.waitForURL(/\/dashboard$/);

    // Already signed in: /admin goes straight to the dashboard.
    await kishan.goto("/admin");
    await kishan.waitForURL(/\/dashboard$/);
    await ctx.close();
  });
});
