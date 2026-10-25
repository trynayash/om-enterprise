import { expect, test, type Browser, type Page } from "@playwright/test";
import { apiCall, expectNoHorizontalScroll, login, OWNER, uniq } from "./helpers";

interface Reference {
  categories: { id: string; name: string }[];
  taxClasses: { id: string; name: string; gstRate: string }[];
}

/** Sign in a freshly created staff member and replace their temporary password. */
async function staffPage(browser: Browser, username: string, temp: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, username, temp);
  await apiCall(page, "POST", "/api/auth/password", { currentPassword: temp, newPassword: `${temp}-Own` });
  return page;
}

test.describe("POS counter", () => {
  test("acceptance scenario: over-limit discount → manager approval → UPI QR → verified UTR → GST tax invoice → PDF", async ({ page, browser }) => {
    test.skip(test.info().project.name !== "desktop", "creates staff accounts and a real bill; runs once");
    test.setTimeout(120_000);

    // ---- Setup by the Super Admin: a non-sample test item with an approved price and a cost, plus two staff.
    await login(page, OWNER.username, OWNER.password);
    const ref = await apiCall<Reference>(page, "GET", "/api/admin/reference");
    const gst18 = ref.taxClasses.find((t) => t.name === "GST 18%");
    expect(gst18).toBeTruthy();
    const tag = uniq("").toUpperCase();
    const productName = `E2E Test Pipe ${tag}`;
    const sku = `E2E-${tag}`;
    const product = await apiCall<{ id: string }>(page, "POST", "/api/admin/products", {
      name: productName,
      categoryId: ref.categories[0].id,
      unitCode: "pcs",
      hsnCode: "3917",
      taxClassId: gst18!.id,
      isSample: false,
    });
    const variant = await apiCall<{ id: string }>(page, "POST", `/api/admin/products/${product.id}/variants`, { sku, name: "Standard", unitCode: "pcs" });
    const price = await apiCall<{ status: string }>(page, "POST", "/api/admin/prices", { variantId: variant.id, price: "1000.00", priceIncludesTax: true, reason: "e2e test price" });
    expect(price.status).toBe("approved");
    await apiCall(page, "POST", "/api/admin/costs", { variantId: variant.id, purchaseCost: "500.00", reason: "e2e test cost" });

    const sachinUser = uniq("sachin");
    const yashUser = uniq("yash");
    await apiCall(page, "POST", "/api/admin/staff", { username: sachinUser, displayName: "Sachin (e2e)", roleKey: "sales", temporaryPassword: "Temp-Sachin-2026!" });
    await apiCall(page, "POST", "/api/admin/staff", { username: yashUser, displayName: "Yash (e2e)", roleKey: "admin", temporaryPassword: "Temp-Yash-2026!" });
    const sachin = await staffPage(browser, sachinUser, "Temp-Sachin-2026!");
    const yash = await staffPage(browser, yashUser, "Temp-Yash-2026!");

    // Sales staff cannot touch master prices or costs, whatever the UI shows.
    for (const [path, body] of [
      ["/api/admin/prices", { variantId: variant.id, price: "1.00", priceIncludesTax: true, reason: "not allowed" }],
      ["/api/admin/costs", { variantId: variant.id, purchaseCost: "1.00", reason: "not allowed" }],
    ] as const) {
      const res = await sachin.request.post(path, { data: body, headers: { Origin: new URL(sachin.url()).origin } });
      expect(res.status()).toBe(403);
    }

    // ---- 1–2. New sale, search, choose the item and quantity.
    await sachin.goto("/pos");
    await sachin.getByTestId("new-sale").click();
    await sachin.waitForURL(/\/pos\/sale\/[0-9a-f-]{36}$/);
    const saleNumber = (await sachin.getByRole("heading", { level: 1 }).textContent())!.trim();
    expect(saleNumber).toMatch(/^S\d{6,}$/);
    await sachin.locator("#pos-search").fill(`Test Pipe ${tag}`);
    await sachin.getByRole("option").filter({ hasText: sku }).click();
    await sachin.locator("#add-qty").fill("3");
    await sachin.getByRole("button", { name: "Add to cart" }).click();
    const cart = sachin.getByRole("region", { name: "Cart" });
    await expect(cart.getByText(productName)).toBeVisible();
    await expect(sachin.getByTestId("grand-total")).toHaveText(/3,000\.00/);

    // ---- 3–4. Discount above Sachin's 5% limit → approval is required before finalising.
    await cart.getByRole("button", { name: "Discount" }).click();
    await sachin.locator("#disc-value").fill("8");
    await expect(sachin.getByText(/above your 5% limit/)).toBeVisible();
    await sachin.locator("#disc-reason").fill("Regular contractor");
    await sachin.getByRole("button", { name: "Apply discount" }).click();
    await expect(sachin.getByTestId("grand-total")).toHaveText(/2,760\.00/);
    const approvalCard = sachin.getByRole("region", { name: "Approval required" });
    await expect(approvalCard).toBeVisible();
    await expect(sachin.getByTestId("finalize")).toBeDisabled();
    // The server refuses too — not just the disabled button.
    const saleId = sachin.url().split("/").pop()!;
    const early = await sachin.request.post(`/api/sales/${saleId}/finalize`, { data: {}, headers: { Origin: new URL(sachin.url()).origin } });
    expect(early.ok()).toBe(false);

    await approvalCard.getByRole("button", { name: "Request approval" }).click();
    await sachin.locator("#reason-text").fill("Contractor buys every month");
    await sachin.getByRole("button", { name: "Send request" }).click();
    await expect(approvalCard.getByText(/Waiting for approval/)).toBeVisible();

    // ---- Admin approves remotely from the dashboard (the request is tied to this exact cart).
    await yash.goto("/dashboard/approvals");
    const request = yash.locator("article, section, div").filter({ has: yash.getByRole("link", { name: saleNumber }) }).filter({ has: yash.getByRole("button", { name: "Approve" }) }).last();
    await expect(request.getByText("Contractor buys every month")).toBeVisible();
    await request.getByRole("button", { name: "Approve" }).click();
    await expect(yash.getByRole("link", { name: saleNumber })).toHaveCount(0);

    // Sachin's screen picks up the decision by itself.
    await expect(sachin.getByText(/Discount approved by Yash \(e2e\)/)).toBeVisible({ timeout: 15_000 });

    // ---- 5. Customer agrees to the final amount; prices lock.
    await expect(sachin.getByTestId("finalize")).toBeEnabled();
    await sachin.getByTestId("finalize").click();
    await sachin.getByRole("button", { name: /Customer agrees — ₹2,760\.00/ }).click();

    // ---- 5b. Who is buying is asked before any QR: name and a valid mobile are needed to go on.
    await expect(sachin.getByRole("region", { name: "Customer details" })).toBeVisible();
    await expect(sachin.getByRole("button", { name: /Show UPI QR/ })).toHaveCount(0);
    const goOn = sachin.getByRole("button", { name: "Continue to payment" });
    await expect(goOn).toBeDisabled();
    await sachin.locator("#c-name").fill("Ramesh Patel (e2e)");
    await sachin.locator("#c-mobile").fill("12345");
    await expect(goOn).toBeDisabled();
    await sachin.locator("#c-mobile").fill("98765 43210");
    await sachin.locator("#c-email").fill("ramesh.e2e@example.com");
    await expect(goOn).toBeEnabled();
    await goOn.click();
    await expect(sachin.getByTestId("customer-summary")).toContainText("Ramesh Patel (e2e)");

    // ---- 6–7. UPI QR for the exact amount; showing it proves nothing.
    await expect(sachin.getByTestId("amount-due")).toHaveText(/2,760\.00/);
    await sachin.getByRole("button", { name: /Show UPI QR for ₹2,760\.00/ }).click();
    await expect(sachin.getByTestId("upi-qr")).toBeVisible();
    await expect(sachin.getByTestId("qr-amount")).toHaveText(/2,760\.00/);
    await expect(sachin.getByText("Not paid yet.")).toBeVisible();
    await expect(sachin.getByTestId("amount-due")).toHaveText(/2,760\.00/);

    // ---- 8. Manual verification needs a 12-digit UTR AND an explicit confirmation.
    await sachin.getByRole("button", { name: "Payment received — verify" }).click();
    const confirm = sachin.getByRole("button", { name: /Confirm ₹2,760\.00 received/ });
    await sachin.locator("#pay-ref").fill("12345");
    await expect(sachin.getByText("UPI references are 12 digits")).toBeVisible();
    const utr = String(Date.now()).slice(-12);
    await sachin.locator("#pay-ref").fill(utr);
    await expect(confirm).toBeDisabled();
    await sachin.getByTestId("confirm-received").check();
    await confirm.click();

    // ---- 9. The bill is made out to the customer taken before the QR.
    await expect(sachin.getByRole("region", { name: "Bill" })).toBeVisible();
    await expect(sachin.getByTestId("bill-to")).toContainText("Ramesh Patel (e2e)");
    await sachin.getByRole("button", { name: "Generate bill" }).click();
    await sachin.waitForURL(/\/pos\/documents\/[0-9a-f-]{36}$/);
    const documentId = sachin.url().split("/").pop()!;

    // ---- 10. A real GST tax invoice with a financial-year number, printable and downloadable.
    await expect(sachin.getByText(/TAX INVOICE/i).first()).toBeVisible();
    await expect(sachin.getByText(/OE\/\d{2}-\d{2}\/\d+/).first()).toBeVisible();
    await expect(sachin.getByText("Ramesh Patel (e2e)").first()).toBeVisible();
    await expect(sachin.getByText("ramesh.e2e@example.com").first()).toBeVisible();
    await expect(sachin.getByText(/NOT A VALID BILL/)).toHaveCount(0);
    await expect(sachin.getByRole("button", { name: "Print" })).toBeVisible();
    const pdf = await sachin.request.get(`/api/documents/${documentId}/pdf`);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

    // The same UTR can never be used for a second payment.
    const other = await apiCall<{ id: string }>(sachin, "POST", "/api/sales", {});
    await apiCall(sachin, "POST", `/api/sales/${other.id}/lines`, { variantId: variant.id, quantity: "1" });
    const fin = await apiCall<{ grandTotal: string }>(sachin, "POST", `/api/sales/${other.id}/finalize`, {});
    const reuse = await sachin.request.post(`/api/sales/${other.id}/payments/verify`, {
      data: { method: "upi", amount: fin.grandTotal, reference: utr, verificationMethod: "manual_merchant_app", confirmReceived: true },
      headers: { Origin: new URL(sachin.url()).origin },
    });
    expect(reuse.ok()).toBe(false);

    // ---- The owner sees the sale, the verified payment and the approval trail.
    await page.goto(`/dashboard/sales/${saleId}`);
    await expect(page.getByText(saleNumber).first()).toBeVisible();
    await expect(page.getByText(utr).first()).toBeVisible();
    await expect(page.getByText(/Yash \(e2e\)/).first()).toBeVisible();

    await sachin.context().close();
    await yash.context().close();
  });

  test("a scanned SKU + Enter adds the item at once, and the sale screen never scrolls sideways", async ({ page }) => {
    await login(page, OWNER.username, OWNER.password);
    await page.goto("/pos");
    await expectNoHorizontalScroll(page);
    await page.getByTestId("new-sale").click();
    await page.waitForURL(/\/pos\/sale\//);
    await page.locator("#pos-search").fill("DEMO-PNT-INT-4L");
    await page.locator("#pos-search").press("Enter");
    await expect(page.getByRole("region", { name: "Cart" }).getByText("DEMO-PNT-INT-4L")).toBeVisible();
    await expect(page.getByText(/training/i).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
