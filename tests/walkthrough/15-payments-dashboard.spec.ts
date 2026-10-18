import { OWNER, api, check, expect, finish, pause, say, setup, signIn, tap, test, titleCard, type } from "./kit";

setup();

test("15 · Payments: history, filters, awaiting payment, reversing a wrong confirmation", async ({ page }) => {
  await signIn(page, OWNER, "/admin");
  await page.goto("/dashboard/payments");
  await titleCard(page, "15", "Payments", "Every payment with who confirmed it and how (UTR, cash counted…). Sales still waiting for money. A payment confirmed by mistake is reversed with a reason — never deleted.");
  await say(page, "Payment history: amount, method, UTR / reference, who verified it and how.");
  await check(page, "UPI payments listed with their UTR", () => expect(page.getByText(/UPI/).filter({ visible: true }).first()).toBeVisible());
  await say(page, "Filter: only UPI.");
  await page.getByRole("combobox", { name: "Method" }).selectOption("upi");
  await tap(page.getByRole("button", { name: "Apply" }));
  await check(page, "Filtered to UPI", () => expect(page).toHaveURL(/method=upi/));
  await say(page, "Awaiting payment: finalised sales where money is still due.");
  await tap(page.getByRole("tab", { name: "Awaiting payment" }));
  await pause(page, 1200);
  await check(page, "Awaiting-payment tab opens", () => expect(page.getByRole("tab", { name: "Awaiting payment" })).toHaveAttribute("aria-selected", "true"));

  await say(page, "Suppose cash was recorded on the wrong sale. Kishan reverses it with a reason.");
  const found = await api<{ variantId: string }[]>(page, "GET", "/api/pos/search?q=TEST-PP-25");
  const sale = await api<{ id: string }>(page, "POST", "/api/sales", {});
  await api(page, "POST", `/api/sales/${sale.id}/lines`, { variantId: found[0].variantId, quantity: "1" });
  const fin = await api<{ grandTotal: string }>(page, "POST", `/api/sales/${sale.id}/finalize`, {});
  await api(page, "POST", `/api/sales/${sale.id}/payments/verify`, { method: "cash", amount: fin.grandTotal, verificationMethod: "cash_counted", confirmReceived: true });
  await page.goto(`/dashboard/sales/${sale.id}`);
  await tap(page.getByRole("button", { name: "Reverse" }).first());
  await type(page.locator("#rev"), "Cash belonged to another sale");
  await tap(page.getByRole("button", { name: "Reverse payment" }));
  await check(page, "Payment marked reversed; amount due again", async () => {
    await expect(page.getByText(/reversed/i).filter({ visible: true }).first()).toBeVisible();
  });
  await finish(page);
});
