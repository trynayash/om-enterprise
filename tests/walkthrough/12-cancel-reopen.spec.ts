import { SACHIN, TEST_ITEM, agree, check, expect, finish, newSaleWith, say, setup, signIn, tap, test, titleCard, type } from "./kit";

setup();

test("12 · Reopen an unpaid sale to edit, and cancel a sale with a reason", async ({ page }) => {
  await page.goto("/login");
  await titleCard(page, "12", "Reopen & cancel", "A finalised but unpaid sale can be reopened to change it. A sale that won't go ahead is cancelled with a reason — it is kept for the record, never deleted.");
  await signIn(page, SACHIN);
  await say(page, "A sale is finalised, then the customer changes their mind about the quantity.");
  await newSaleWith(page, "TEST Pressure", TEST_ITEM.sku, "2");
  await agree(page);
  await tap(page.getByRole("button", { name: "Reopen to edit" }));
  await type(page.locator("#reason-text"), "Customer wants 4 instead of 2");
  await tap(page.getByRole("button", { name: "Reopen", exact: true }));
  await check(page, "Sale is editable again", () => expect(page.getByTestId("finalize")).toBeVisible());
  const qty = page.getByRole("textbox", { name: /Quantity of/ });
  await type(qty, "4");
  await qty.press("Enter");
  await check(page, "Quantity updated to 4", () => expect(qty).toHaveValue("4"));

  await say(page, "Now the customer leaves without buying: cancel the sale with a reason.");
  await tap(page.getByRole("button", { name: "Cancel sale" }));
  await type(page.locator("#reason-text"), "Customer left without buying");
  await tap(page.getByRole("button", { name: "Cancel sale" }).last());
  await page.waitForURL(/\/pos$/);
  await check(page, "Back on the POS home", () => expect(page).toHaveURL(/\/pos$/));
  await say(page, "The cancelled sale stays in history with its reason.");
  await page.goto("/pos/bills");
  await check(page, "Bills & sales history page", () => expect(page.getByRole("heading", { level: 1 })).toBeVisible());
  await finish(page);
});
