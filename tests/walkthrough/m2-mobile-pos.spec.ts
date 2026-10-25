import { SACHIN, TEST_ITEM, check, expect, finish, noSideScroll, pause, say, setup, signIn, tap, test, titleCard, type } from "./kit";

setup();

test("M2 · Counter sale on a phone", async ({ page }) => {
  await page.goto("/login");
  await titleCard(page, "M2", "POS on a phone", "Sachin can bill from a phone: search, cart, the total always visible at the bottom, payment and bill.");
  await signIn(page, SACHIN);
  await check(page, "POS home fits the phone", () => noSideScroll(page));
  await tap(page.getByTestId("new-sale"));
  await page.waitForURL(/\/pos\/sale\//);
  await say(page, "Search and add 2 pieces.");
  await type(page.locator("#pos-search"), "TEST Pressure");
  await tap(page.getByRole("option").filter({ hasText: TEST_ITEM.sku }));
  await type(page.locator("#add-qty"), "2");
  await tap(page.getByRole("button", { name: "Add to cart" }));
  await check(page, "Cart on the phone", () => expect(page.getByRole("region", { name: "Cart" }).getByText(TEST_ITEM.sku)).toBeVisible());
  await check(page, "Total always visible at the bottom", () => expect(page.getByRole("link", { name: /Checkout/ })).toBeVisible());
  await check(page, "No sideways scrolling", () => noSideScroll(page));
  await say(page, "Checkout: agree the total, take cash.");
  await tap(page.getByRole("link", { name: /Checkout/ }));
  await tap(page.getByTestId("finalize"));
  await tap(page.getByRole("button", { name: /Customer agrees/ }));
  await say(page, "The customer's name and mobile come before payment.");
  await type(page.locator("#c-name"), "Walk-in customer");
  await type(page.locator("#c-mobile"), "9825012345");
  await check(page, "Customer form fits the phone", () => noSideScroll(page));
  await tap(page.getByRole("button", { name: "Continue to payment" }));
  await tap(page.getByRole("button", { name: /Record cash, card, bank transfer/ }));
  await page.getByTestId("confirm-received").check();
  await pause(page, 600);
  await tap(page.getByRole("button", { name: /^Confirm .* received$/ }));
  await tap(page.getByRole("button", { name: "Generate bill" }));
  await page.waitForURL(/\/pos\/documents\//);
  await check(page, "Bill on the phone", () => expect(page.getByText(/OE\/\d{2}-\d{2}\/\d+/).filter({ visible: true }).first()).toBeVisible());
  await check(page, "Bill fits the phone", () => noSideScroll(page));
  await finish(page);
});
