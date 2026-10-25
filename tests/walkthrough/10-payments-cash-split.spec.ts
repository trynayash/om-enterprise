import { SACHIN, TEST_ITEM, agree, check, expect, finish, inr, newSaleWith, pause, say, setup, signIn, tap, test, titleCard, type } from "./kit";

setup();

test("10 · Cash with change, split payment (part UPI, part cash), and a quick cash sale", async ({ page }) => {
  await page.goto("/login");
  await titleCard(page, "10", "Taking payment", "Cash with change calculated, a bill paid partly by UPI and partly in cash, and a quick cash sale without customer details.");
  await signIn(page, SACHIN);

  await say(page, "Sale 1: 3 pieces, paid in cash. The customer hands over ₹2,000.");
  await newSaleWith(page, "TEST Pressure", TEST_ITEM.sku, "3");
  await agree(page);
  const due = inr(await page.getByTestId("amount-due").textContent());
  await tap(page.getByRole("button", { name: /Record cash, card, bank transfer/ }));
  await type(page.locator("#pay-tendered"), "2000");
  await check(page, `Change to return: ₹${(2000 - due).toFixed(2)}`, () => expect(page.getByText(`Return change: ₹${(2000 - due).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`)).toBeVisible());
  await page.getByTestId("confirm-received").check();
  await tap(page.getByRole("button", { name: /^Confirm .* received$/ }));
  await say(page, "Paid in full: a walk-in on a small bill needs no customer details.");
  await tap(page.getByRole("button", { name: "Generate bill" }));
  await page.waitForURL(/\/pos\/documents\//);
  await check(page, "Bill issued without customer details", () => expect(page.getByRole("heading", { level: 1 })).toContainText(/Tax Invoice/i));

  await say(page, "Sale 2: 5 pieces, paid partly by UPI and the rest in cash.");
  await newSaleWith(page, "TEST Pressure", TEST_ITEM.sku, "5");
  await agree(page, { name: "Suresh Rathwa", mobile: "9825098765" });
  const total = inr(await page.getByTestId("amount-due").textContent());
  await type(page.locator("#qr-amount"), "1000");
  await tap(page.getByRole("button", { name: /Show UPI QR for/ }));
  await check(page, "QR for the part payment ₹1,000.00", async () => expect(inr(await page.getByTestId("qr-amount").textContent())).toBe(1000));
  await tap(page.getByRole("button", { name: "Payment received — verify" }));
  await type(page.locator("#pay-ref"), String(Date.now() + 7).slice(-12));
  await page.getByTestId("confirm-received").check();
  await tap(page.getByRole("button", { name: /^Confirm .* received$/ }));
  await check(page, `Remaining due ₹${(total - 1000).toFixed(2)}`, async () => expect(Math.abs(inr(await page.getByTestId("amount-due").textContent()) - (total - 1000))).toBeLessThan(0.01));
  await pause(page, 1000);
  await say(page, "The rest in cash.");
  await tap(page.getByRole("button", { name: /Record cash, card, bank transfer/ }));
  await page.getByTestId("confirm-received").check();
  await tap(page.getByRole("button", { name: /^Confirm .* received$/ }));
  await check(page, "Fully paid — the bill step opens", async () => {
    await expect(page.getByRole("region", { name: "Bill" })).toBeVisible();
    await expect(page.getByTestId("amount-due")).toHaveCount(0);
    await expect(page.getByTestId("bill-to")).toContainText("Suresh Rathwa");
  });
  await tap(page.getByRole("button", { name: "Generate bill" }));
  await page.waitForURL(/\/pos\/documents\//);
  await check(page, "Bill issued", () => expect(page.getByText(/OE\/\d{2}-\d{2}\/\d+/).filter({ visible: true }).first()).toBeVisible());
  await finish(page);
});
