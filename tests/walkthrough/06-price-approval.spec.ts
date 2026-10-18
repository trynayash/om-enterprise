import { OWNER, TEST_ITEM, YASH, api, check, expect, finish, say, setup, signIn, tap, test, titleCard, type } from "./kit";

setup();

test("06 · Price change by an Admin needs the owner's approval", async ({ page }) => {
  await page.goto("/login");
  await titleCard(page, "06", "Price approval", "Yash (Admin) signs in for the first time, proposes a new price, and it only takes effect after Kishan approves it. Every version is kept.");

  await say(page, "Yash's first sign-in with his temporary password: he must choose his own.");
  await signIn(page, { username: YASH.username, password: YASH.temp });
  await check(page, "Forced password change on first sign-in", () => expect(page).toHaveURL(/\/account\/password/));
  await type(page.locator("#cur"), YASH.temp);
  await type(page.locator("#new"), YASH.password);
  await type(page.locator("#conf"), YASH.password);
  await tap(page.getByRole("button", { name: "Save new password" }));
  await page.waitForURL(/\/account\/security|\/dashboard/);
  if (page.url().includes("/account/security")) {
    await say(page, "He is offered a secret key — he skips it for now.");
    await tap(page.getByRole("link", { name: "Skip for now" }));
  }
  await page.waitForURL(/\/dashboard/);

  await say(page, "He opens the TEST product and proposes ₹440 (from ₹420).");
  const list = await api<{ items: { id: string }[] }>(page, "GET", `/api/admin/products?q=${encodeURIComponent("TEST Pressure")}`);
  await page.goto(`/dashboard/products/${list.items[0].id}`);
  await type(page.getByLabel(/Selling price per piece/), "440");
  await type(page.getByLabel("Reason for the change"), "TEST supplier increase");
  await tap(page.getByRole("button", { name: /Submit for approval|Save price/ }));
  await check(page, "Yash's price waits for approval", () => expect(page.getByText(/waiting for approval|pending/i).filter({ visible: true }).first()).toBeVisible());
  await check(page, "The live price is still ₹420.00", () => expect(page.getByText("₹420.00").filter({ visible: true }).first()).toBeVisible());

  await say(page, "Kishan signs in (password + secret key) and opens Approvals.");
  await api(page, "POST", "/api/auth/logout", {});
  await signIn(page, OWNER, "/admin");
  await page.goto("/dashboard/approvals");
  const card = page.locator("div").filter({ has: page.getByText(TEST_ITEM.sku) }).filter({ has: page.getByRole("button", { name: "Approve" }) }).last();
  await check(page, "The proposal is listed with old → new price and reason", async () => {
    await expect(card.getByText("₹440.00").filter({ visible: true }).first()).toBeVisible();
    await expect(card.getByText(/TEST supplier increase/).filter({ visible: true }).first()).toBeVisible();
  });
  await say(page, "He approves it.");
  await tap(card.getByRole("button", { name: "Approve" }));
  await check(page, "Approved — the list is empty", () => expect(page.getByText(TEST_ITEM.sku)).toHaveCount(0));

  await say(page, "The product now sells at ₹440, and the history shows both versions.");
  await page.goto(`/dashboard/products/${list.items[0].id}`);
  await check(page, "Live price ₹440.00", () => expect(page.getByText("₹440.00").filter({ visible: true }).first()).toBeVisible());
  await tap(page.getByRole("tab", { name: "History" }));
  await check(page, "History: ₹420 → ₹440 approved by Kishan", () => expect(page.getByRole("row").filter({ hasText: "TEST supplier increase" }).first()).toContainText("Kishan"));
  await finish(page);
});
