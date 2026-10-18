import { expect, test } from "@playwright/test";
import { apiCall, login, OWNER, uniq } from "./helpers";

test.describe("catalogue & pricing admin", () => {
  test("product list, editor, price review and import screens work for the owner", async ({ page }) => {
    await login(page, OWNER.username, OWNER.password);
    await page.goto("/dashboard/products");
    const row = page.getByText("SAMPLE Interior Emulsion").filter({ visible: true }).first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.getByRole("heading", { name: /SAMPLE Interior Emulsion/ })).toBeVisible();
    await page.goto("/dashboard/pricing");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto("/dashboard/import");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("bulk import validation reports duplicate SKUs and unknown categories without importing", async ({ page }) => {
    await login(page, OWNER.username, OWNER.password);
    const csv = [
      "product_name,category,unit,sku,variant_name,selling_price,is_sample",
      "SAMPLE Import A,berger-paints,pcs,DEMO-PNT-INT-1L,White 1 L,100,yes",
      "SAMPLE Import B,no-such-category,pcs,NEW-SKU-1,Std,100,yes",
      "SAMPLE Import C,berger-paints,pcs,NEW-SKU-1,Std,100,yes",
    ].join("\n");
    const report = await apiCall<{ errorCount: number; rows: { messages: string[] }[] }>(page, "POST", "/api/admin/import/validate", { csv });
    expect(report.errorCount).toBe(3);
    const all = report.rows.flatMap((r) => r.messages).join(" | ");
    expect(all).toMatch(/already exists/);
    expect(all).toMatch(/Unknown category/);
    expect(all).toMatch(/more than once/);
    const res = await page.request.post("/api/admin/import/commit", { data: { csv }, headers: { Origin: new URL(page.url()).origin } });
    expect(res.status()).toBe(422);
  });

  test("an admin without cost access never receives cost or margin data, even from the raw API", async ({ page, browser }) => {
    test.skip(test.info().project.name !== "desktop", "account setup runs once");
    await login(page, OWNER.username, OWNER.password);
    const username = uniq("vikram");
    const temp = "Temp-Vikram-2026!";
    const { id } = await apiCall<{ id: string }>(page, "POST", "/api/admin/staff", { username, displayName: "Vikram (e2e)", roleKey: "admin", temporaryPassword: temp });
    await apiCall(page, "PUT", `/api/admin/staff/${id}/permissions`, { overrides: [{ permission: "costs.view", effect: "deny" }] });
    const products = await apiCall<{ items: { id: string; name: string }[] }>(page, "GET", "/api/admin/products?q=Interior");
    const productId = products.items[0].id;

    const ctx = await browser.newContext();
    const vikram = await ctx.newPage();
    await login(vikram, username, temp);
    await apiCall(vikram, "POST", "/api/auth/password", { currentPassword: temp, newPassword: "Vikram-Own-Pass-2026!" });
    const detail = await apiCall<{ costs: unknown; pricesByList: Record<string, Record<string, { landedCostSnapshot: string | null; marginPercentSnapshot: string | null }>> }>(
      vikram,
      "GET",
      `/api/admin/products/${productId}`,
    );
    expect(detail.costs).toBeNull();
    for (const list of Object.values(detail.pricesByList)) {
      for (const v of Object.values(list)) {
        expect(v.landedCostSnapshot).toBeNull();
        expect(v.marginPercentSnapshot).toBeNull();
      }
    }
    // Proposing a price works but waits for the Super Admin
    const variant = (await apiCall<{ variants: { id: string }[] }>(vikram, "GET", `/api/admin/products/${productId}`)).variants[0];
    const proposal = await apiCall<{ status: string }>(vikram, "POST", "/api/admin/prices", { variantId: variant.id, price: "360", priceIncludesTax: true, reason: "e2e proposal" });
    expect(proposal.status).toBe("pending");
    const cost = await vikram.request.post("/api/admin/costs", {
      data: { variantId: variant.id, purchaseCost: "1", reason: "not allowed" },
      headers: { Origin: new URL(vikram.url()).origin },
    });
    expect(cost.status()).toBe(403);
    await ctx.close();
  });
});
