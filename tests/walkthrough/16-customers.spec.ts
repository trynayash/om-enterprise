import { OWNER, check, expect, finish, say, setup, signIn, tap, test, titleCard, type } from "./kit";

setup();

test("16 · Customers: search, history, lifetime value, add a customer", async ({ page }) => {
  await signIn(page, OWNER, "/admin");
  await page.goto("/dashboard/customers");
  await titleCard(page, "16", "Customers", "Customers are saved from bills. Each has their bill history and totals; GST details are checked (GSTIN checksum, state).");
  await say(page, "Search for Ramesh.");
  await type(page.getByRole("searchbox", { name: "Search" }), "Ramesh");
  await tap(page.getByRole("button", { name: "Apply" }));
  await check(page, "Ramesh Patel found", () => expect(page.getByText("Ramesh Patel").filter({ visible: true }).first()).toBeVisible());
  await tap(page.getByRole("link", { name: /Ramesh Patel/ }).filter({ visible: true }).first());
  await check(page, "Customer page with bill history", () => expect(page.getByText(/OE\/\d{2}-\d{2}\/\d+/).filter({ visible: true }).first()).toBeVisible());
  await say(page, "Add a business customer with a GSTIN.");
  await page.goto("/dashboard/customers");
  await tap(page.getByRole("button", { name: "Add customer" }));
  const d = page.locator("dialog[open]");
  await type(d.getByRole("textbox", { name: /^Name/ }), "Mahadev Builders");
  await type(d.getByLabel("Mobile"), "9712345678");
  await type(d.getByLabel("GSTIN"), "24ABCDE1234F1Z0");
  await tap(d.getByRole("button", { name: /Save|Create|Add/ }).last());
  await check(page, "A GSTIN with a wrong check digit is rejected", () => expect(page.getByText(/check digit is invalid/).filter({ visible: true }).first()).toBeVisible());
  await d.getByLabel("GSTIN").fill("");
  await tap(d.getByRole("button", { name: /Save|Create|Add/ }).last());
  await check(page, "Customer saved", () => expect(page.getByText("Mahadev Builders").filter({ visible: true }).first()).toBeVisible());
  await finish(page);
});
