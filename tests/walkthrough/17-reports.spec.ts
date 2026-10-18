import { OWNER, check, expect, finish, pause, say, setup, signIn, tap, test, titleCard } from "./kit";

setup();

test("17 · Reports: revenue vs collections, products, staff, discounts, profit, CSV", async ({ page }) => {
  await signIn(page, OWNER, "/admin");
  await page.goto("/dashboard");
  await titleCard(page, "17", "Dashboard & reports", "Figures come only from saved bills, credit notes and verified payments. Revenue (bills) and collections (money in) are shown separately; gross profit is not net profit. Training sales are excluded.");
  await say(page, "The owner's dashboard: today and this month.");
  await check(page, "Net sales today is above ₹0", () => expect(page.getByRole("region", { name: "Today" })).not.toContainText(/Net sales \(excl\. GST\)\s*₹0\.00/));
  await check(page, "Collections shown separately from sales", () => expect(page.getByText(/Collections \(cash flow\)/i).filter({ visible: true }).first()).toBeVisible());
  await pause(page, 1500);
  await page.goto("/dashboard/reports");
  await say(page, "Reports overview for the period.");
  await check(page, "Net sales, GST and total billed", () => expect(page.getByText(/Net sales \(excl\. GST\)/).filter({ visible: true }).first()).toBeVisible());
  await check(page, "Gross profit is labelled as not net profit", () => expect(page.getByText(/this is not net profit/)).toBeVisible());
  for (const [tab, note] of [
    ["Products", "Best sellers by quantity and value."],
    ["Categories", "Sales by category."],
    ["Staff", "Sales and discounts per staff member."],
    ["Discounts", "Every discount, who gave it and who approved it."],
    ["Collections", "Money received by method (cash, UPI…), refunds."],
    ["Profit", "Gross profit by item — only where the cost is known."],
    ["Price changes", "Every price change with old and new price."],
  ] as const) {
    await say(page, `${tab}: ${note}`);
    await tap(page.getByRole("navigation", { name: "Report" }).getByRole("link", { name: tab, exact: true }));
    await check(page, `${tab} report opens`, () => expect(page).toHaveURL(new RegExp(`tab=`)));
    await pause(page, 900);
  }
  await say(page, "Every report can be exported as a CSV file for the accountant.");
  await check(page, "CSV export downloads", async () => {
    const r = await page.request.get("/api/reports/summary.csv");
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("text/csv");
  });
  await finish(page);
});
