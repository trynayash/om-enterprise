import { OWNER, check, expect, finish, pause, say, setup, signIn, test, titleCard, type } from "./kit";

setup();

test("18 · Audit log: who did what, when", async ({ page }) => {
  await signIn(page, OWNER, "/admin");
  await page.goto("/dashboard/audit");
  await titleCard(page, "18", "Audit log", "An append-only record of sign-ins, permission and price changes, approvals, payments, bills, cancellations and settings — it cannot be edited or deleted.");
  await say(page, "Everything that happened in the earlier videos is recorded.");
  await check(page, "Sign-ins with secret key recorded", () => expect(page.getByText(/Signed in \(password \+ secret key\)/).filter({ visible: true }).first()).toBeVisible());
  await say(page, "Search the log for the TEST item: its price changes and approvals appear.");
  await type(page.getByRole("textbox", { name: "Search audit log" }), "TEST-PP-25");
  await page.keyboard.press("Enter");
  await pause(page, 1500);
  await check(page, "Price change to ₹440 found in the log", () => expect(page.getByText(/440/).filter({ visible: true }).first()).toBeVisible());
  await say(page, "Filter by type: discount approvals — who asked, who approved, and how.");
  await page.goto("/dashboard/audit");
  await page.getByRole("combobox", { name: "Action type" }).selectOption("discount.");
  await pause(page, 1500);
  await check(page, "Discount approvals listed", () => expect(page.getByText(/approv/i).filter({ visible: true }).first()).toBeVisible());
  await say(page, "Filter: payments — every confirmation with its UTR.");
  await page.getByRole("combobox", { name: "Action type" }).selectOption("payment.");
  await pause(page, 1500);
  await check(page, "Payment confirmations listed", () => expect(page.getByText(/UPI|ref/i).filter({ visible: true }).first()).toBeVisible());
  await finish(page);
});
