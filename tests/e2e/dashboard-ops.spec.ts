import { expect, test } from "@playwright/test";
import { login, makeTrainingBill, OWNER } from "./helpers";
import { formatINR } from "../../src/lib/money";

test.describe("dashboard operations", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, OWNER.username, OWNER.password);
  });

  test("overview never invents numbers and training sales stay out of it", async ({ page }) => {
    await makeTrainingBill(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Only training sales exist in the e2e database → business totals stay at zero.
    await expect(page.getByText("₹0.00").first()).toBeVisible();
  });

  test("a billed training sale is fully traceable: sale, payment, document", async ({ page }) => {
    const bill = await makeTrainingBill(page);
    expect(bill.docNumber).toMatch(/^TRN\//);
    await page.goto(`/dashboard/sales/${bill.saleId}`);
    await expect(page.getByText(bill.saleNumber).first()).toBeVisible();
    await expect(page.getByText(/training sale/i).first()).toBeVisible();
    await expect(page.getByText(formatINR(bill.grandTotal)).first()).toBeVisible();
    await expect(page.getByText(bill.docNumber).first()).toBeVisible();

    await page.goto(`/dashboard/documents/${bill.documentId}`);
    await expect(page.getByText(bill.docNumber).first()).toBeVisible();
    await expect(page.getByText(/NOT A VALID BILL/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
    const pdf = await page.request.get(`/api/documents/${bill.documentId}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  });
});
