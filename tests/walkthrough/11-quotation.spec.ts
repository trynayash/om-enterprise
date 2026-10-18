import { SACHIN, TEST_ITEM, check, expect, finish, newSaleWith, say, setup, signIn, tap, test, titleCard, type } from "./kit";

setup();

test("11 · Quotation with prices held for the validity period", async ({ page }) => {
  await page.goto("/login");
  await titleCard(page, "11", "Quotation", "A contractor wants a price before buying: Sachin saves the cart as a quotation (QT number). Its prices are held for the validity period set in Settings.");
  await signIn(page, SACHIN);
  await say(page, "Add 12 pieces (the bulk price applies at 10+).");
  await newSaleWith(page, "TEST Pressure", TEST_ITEM.sku, "12");
  await say(page, "Save quotation, with the contractor's name.");
  await tap(page.getByRole("button", { name: "Save quotation" }));
  await type(page.locator("#q-name"), "Jagdish Contractor");
  await type(page.locator("#q-mobile"), "9898989898");
  await tap(page.getByRole("button", { name: "Create quotation" }));
  await page.waitForURL(/\/pos\/documents\//);
  await check(page, "Quotation issued with a QT number", () => expect(page.getByText(/QT\/\d{2}-\d{2}\/\d+/).filter({ visible: true }).first()).toBeVisible());
  await check(page, "Shows the contractor's name", () => expect(page.getByText("Jagdish Contractor").filter({ visible: true }).first()).toBeVisible());
  await say(page, "Back on the sale: the quoted prices are marked and held until the validity date.");
  await tap(page.getByRole("link", { name: /Sale S\d+/ }));
  await check(page, "Lines marked 'Quoted price'", () => expect(page.getByText("Quoted price").filter({ visible: true }).first()).toBeVisible());
  await check(page, "Validity shown", () => expect(page.getByText(/prices held until/)).toBeVisible());
  await finish(page);
});
