import { OWNER, check, expect, finish, say, setup, signIn, tap, test, titleCard, type } from "./kit";

setup();

test("21 · Inventory-ready: suppliers, stock switched off until counted", async ({ page }) => {
  await signIn(page, OWNER, "/admin");
  await page.goto("/dashboard/inventory");
  await titleCard(page, "21", "Inventory (ready, off by default)", "Stock is never invented: tracking stays off until the opening stock is counted and the Super Admin switches it on. Suppliers can already be recorded.");
  await say(page, "Stock tracking is ready but not switched on.");
  await check(page, "Honest 'not switched on' message", () => expect(page.getByRole("heading", { name: "Stock tracking is ready but not switched on" })).toBeVisible());
  await say(page, "Add a supplier.");
  await tap(page.getByRole("button", { name: "New supplier" }));
  const d = page.locator("dialog[open]");
  await type(d.getByRole("textbox", { name: /^Name/ }), "TEST Supplier (walkthrough)");
  await type(d.getByLabel("Mobile"), "9000000001");
  await tap(d.getByRole("button", { name: /Save|Create|Add/ }).last());
  await check(page, "Supplier saved", () => expect(page.getByText("TEST Supplier (walkthrough)").filter({ visible: true }).first()).toBeVisible());
  await finish(page);
});
