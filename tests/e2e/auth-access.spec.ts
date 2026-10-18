import { expect, test } from "@playwright/test";
import { login, OWNER, uniq } from "./helpers";

test.describe("authentication & access control", () => {
  test("rejects a wrong password with a generic message", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#username", OWNER.username);
    await page.fill("#password", "definitely-wrong-1");
    await page.click("button[type=submit]");
    await expect(page.getByText("Invalid username or password")).toBeVisible();
  });

  test("signed-out visitors are sent to sign in", async ({ page }) => {
    await page.goto("/dashboard/staff");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fstaff/);
  });

  test("owner creates Sachin; Sachin must set a password, lands on the POS and cannot reach admin areas", async ({ page, browser }) => {
    test.skip(test.info().project.name !== "desktop", "account setup runs once");
    await login(page, OWNER.username, OWNER.password);
    await page.goto("/dashboard/staff");
    await page.getByRole("button", { name: "Add staff member" }).click();
    const username = uniq("sachin");
    const dialog = page.locator("dialog[open]");
    await dialog.getByLabel("Full name").fill("Sachin (e2e)");
    await dialog.getByLabel("Username").fill(username);
    const temp = await dialog.getByLabel("Temporary password").inputValue();
    await dialog.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(`@${username}`)).toBeVisible();

    const ctx = await browser.newContext();
    const sachin = await ctx.newPage();
    await login(sachin, username, temp);
    await expect(sachin).toHaveURL(/\/account\/password\?required=1/);
    await sachin.fill("#cur", temp);
    await sachin.fill("#new", "Counter-Sachin-2026!");
    await sachin.fill("#conf", "Counter-Sachin-2026!");
    await sachin.getByRole("button", { name: "Save new password" }).click();
    await sachin.waitForURL(/\/pos/);

    await sachin.goto("/dashboard/staff");
    await expect(sachin).toHaveURL(/\/dashboard\/forbidden/);
    // Server-side enforcement, not just hidden buttons:
    const settings = await sachin.request.get("/api/admin/settings");
    expect(settings.status()).toBe(403);
    const cost = await sachin.request.post("/api/admin/costs", {
      data: { variantId: "00000000-0000-0000-0000-000000000000", purchaseCost: "1", reason: "hack" },
      headers: { Origin: new URL(sachin.url()).origin },
    });
    expect(cost.status()).toBe(403);
    await ctx.close();
  });

  test("cross-site POSTs are refused", async ({ page }) => {
    await login(page, OWNER.username, OWNER.password);
    const res = await page.request.post("/api/sales", { data: {}, headers: { Origin: "https://evil.example" } });
    expect(res.status()).toBe(403);
  });

  test("security headers are set", async ({ request }) => {
    const res = await request.get("/login");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-robots-tag"]).toContain("noindex");
  });
});

test.describe("admin screens", () => {
  test("reports, settings and audit log load for the owner", async ({ page }) => {
    await login(page, OWNER.username, OWNER.password);
    await page.goto("/dashboard/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect(page.getByText("Net sales (excl. GST)")).toBeVisible();
    await page.goto("/dashboard/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await page.goto("/dashboard/audit");
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
    await expect(page.getByText("Signed in").first()).toBeVisible();
  });
});
