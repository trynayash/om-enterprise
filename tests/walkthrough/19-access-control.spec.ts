import { SACHIN, VIKRAM, api, check, expect, finish, say, setup, signIn, tap, test, titleCard, type } from "./kit";

setup();

test("19 · Access control: what Sachin and Vikram Uncle can and cannot do", async ({ page }) => {
  await page.goto("/login");
  await titleCard(page, "19", "Who can do what", "Permissions are enforced on the server, not just hidden in menus. Sachin (Sales) can't open admin pages or change prices; Vikram Uncle (Admin, cost access denied) never receives cost figures.");
  await signIn(page, SACHIN);
  for (const [url, name] of [["/dashboard/pricing", "price review"], ["/dashboard/settings", "settings"], ["/dashboard/staff", "staff"], ["/dashboard/reports", "reports"]] as const) {
    await say(page, `Sachin tries to open ${name}…`);
    await page.goto(url);
    await check(page, `Sachin is refused ${name}`, () => expect(page).toHaveURL(/forbidden|\/pos/));
  }
  await say(page, "Even calling the server directly to change a price is refused.");
  await check(page, "Price change API answers 403 Forbidden", async () => {
    const found = await api<{ variantId: string }[]>(page, "GET", "/api/pos/search?q=TEST-PP-25");
    const r = await page.request.post("/api/admin/prices", { data: { variantId: found[0].variantId, price: "1.00", priceIncludesTax: true, reason: "try" }, headers: { Origin: new URL(page.url()).origin } });
    expect(r.status()).toBe(403);
  });
  await api(page, "POST", "/api/auth/logout", {});

  await say(page, "Vikram Uncle's first sign-in (Admin, but Kishan denied him cost access).");
  await signIn(page, { username: VIKRAM.username, password: VIKRAM.temp });
  await type(page.locator("#cur"), VIKRAM.temp);
  await type(page.locator("#new"), VIKRAM.password);
  await type(page.locator("#conf"), VIKRAM.password);
  await tap(page.getByRole("button", { name: "Save new password" }));
  await page.waitForURL(/\/account\/security|\/dashboard/);
  if (page.url().includes("/account/security")) await tap(page.getByRole("link", { name: "Skip for now" }));
  await page.waitForURL(/\/dashboard/);
  const list = await api<{ items: { id: string }[] }>(page, "GET", `/api/admin/products?q=${encodeURIComponent("TEST Pressure")}`);
  await page.goto(`/dashboard/products/${list.items[0].id}`);
  await say(page, "He can manage the product, but costs and margins are not sent to his browser at all.");
  await check(page, "No landed cost shown to Vikram", () => expect(page.getByText("₹255.00")).toHaveCount(0));
  await check(page, "Product data from the server has no cost", async () => {
    const detail = await api<{ costs: unknown }>(page, "GET", `/api/admin/products/${list.items[0].id}`);
    expect(detail.costs).toBeNull();
  });
  await finish(page);
});
