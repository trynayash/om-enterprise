import { expect, test } from "@playwright/test";
import { apiCall, login, makeTrainingBill, OWNER } from "./helpers";
import { formatINR } from "../../src/lib/money";

test.describe("dashboard operations", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, OWNER.username, OWNER.password);
  });

  test("overview never invents numbers and training sales stay out of it", async ({ page }) => {
    const today = page.getByRole("region", { name: "Today" });
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const before = await today.innerText();
    // Figures come from recorded sales only, never placeholders.
    expect(before).toMatch(/Net sales \(excl\. GST\)\s*₹[\d,]+\.\d{2}/i);
    // A paid training bill must not move any business total.
    await makeTrainingBill(page);
    await page.reload();
    await expect(today).toBeVisible();
    expect(await today.innerText()).toBe(before);
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

    // The customer's copy (handed to WhatsApp on the counter phone) is not counted as a print.
    const printed = (await apiCall<{ printCount: number }>(page, "GET", `/api/documents/${bill.documentId}`)).printCount;
    expect((await page.request.get(`/api/documents/${bill.documentId}/pdf?copy=customer`)).status()).toBe(200);
    expect((await apiCall<{ printCount: number }>(page, "GET", `/api/documents/${bill.documentId}`)).printCount).toBe(printed);
  });
});
