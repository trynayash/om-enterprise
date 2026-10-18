import { OWNER, SACHIN, TEST_ITEM, check, expect, finish, newSaleWith, say, setup, signIn, tap, test, titleCard, type } from "./kit";

setup();

test("09 · Manager approval at the counter needs the manager's secret key", async ({ page }) => {
  await page.goto("/login");
  await titleCard(page, "09", "Approval at the counter", "When Kishan is in the shop he can approve a discount on Sachin's screen with his own username, password — and secret key. Without the key the approval is refused.");
  await signIn(page, SACHIN);
  await say(page, "Sachin rings up 1 piece and gives 7% off — above his limit.");
  await newSaleWith(page, "TEST Pressure", TEST_ITEM.sku, "1");
  const cart = page.getByRole("region", { name: "Cart" });
  await tap(cart.getByRole("button", { name: "Discount" }));
  await type(page.locator("#disc-value"), "7");
  await type(page.locator("#disc-reason"), "Bulk buyer");
  await tap(page.getByRole("button", { name: "Apply discount" }));
  const approval = page.getByRole("region", { name: "Approval required" });
  await check(page, "Approval needed", () => expect(approval).toBeVisible());

  await say(page, "Kishan types his username and password on Sachin's screen — but not the secret key.");
  await tap(approval.getByRole("button", { name: "Manager approves here" }));
  await type(page.locator("#appr-user"), OWNER.username);
  await type(page.locator("#appr-pass"), OWNER.password);
  await tap(page.getByRole("button", { name: "Approve", exact: true }));
  await check(page, "Refused without the secret key", () => expect(page.getByText(/secret key is incorrect/)).toBeVisible());

  await say(page, "With the secret key it is accepted, and Kishan's name is recorded on the sale.");
  await type(page.locator("#appr-pass"), OWNER.password);
  await type(page.locator("#appr-secret"), OWNER.secret);
  await tap(page.getByRole("button", { name: "Approve", exact: true }));
  await check(page, "Approved in person by Kishan", () => expect(page.getByText(/Discount approved by Kishan/)).toBeVisible());
  await check(page, "Recorded as 'In person at the counter'", () => expect(page.getByText(/In person at the counter/)).toBeVisible());
  await check(page, "Finalise unlocked", () => expect(page.getByTestId("finalize")).toBeEnabled());
  await finish(page);
});
