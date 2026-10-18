import { OWNER, check, expect, finish, pause, say, setup, signIn, tap, test, titleCard, type } from "./kit";

setup();

test("03 · Settings: business, GST, documents, payments, discounts, security", async ({ page }) => {
  await signIn(page, OWNER, "/admin");
  await page.goto("/dashboard/settings");
  await titleCard(page, "03", "Settings", "Only the Super Admin changes business details, GST, numbering, payment and discount rules. Every change is saved with a before/after record in the audit log.");

  await say(page, "Business details: name, address, phone, WhatsApp, email, GSTIN.");
  await check(page, "Business details are pre-filled", () => expect(page.getByRole("textbox", { name: "Business name" })).toHaveValue("OM ENTERPRISE"));
  await say(page, "Change the opening hours and save.");
  await type(page.getByRole("textbox", { name: "Opening hours" }), "Mon–Sat 8:30 am – 8:30 pm");
  await tap(page.getByRole("button", { name: "Save business details" }));
  await check(page, "Business details saved", () => expect(page.getByText("Settings saved").filter({ visible: true }).first()).toBeVisible());
  await page.reload();
  await check(page, "The change persists after reload", () => expect(page.getByRole("textbox", { name: "Opening hours" })).toHaveValue("Mon–Sat 8:30 am – 8:30 pm"));

  for (const [section, note] of [
    ["GST & tax", "GST registration type (confirmed with the accountant), prices incl. GST, rounding, ₹50,000 customer-details rule and tax classes."],
    ["Billing documents", "Document number prefixes per type, quotation validity, terms printed on bills, bank details."],
    ["Payments", "UPI ID for the QR, which payment methods are allowed, QR expiry and UTR requirement."],
    ["Discounts & margins", "Minimum and target margins, reasons for discounts, credit sales and in-person approval."],
    ["Price changes", "Whether price changes need approval, and when prices should be reviewed."],
    ["Website", "What the public website shows."],
    ["Security", "Session length, idle timeout, password length and account lockout."],
    ["Inventory", "Stock tracking — off by default until opening stock is counted."],
  ] as const) {
    await say(page, `${section}: ${note}`);
    await tap(page.getByRole("button", { name: section, exact: true }));
    await check(page, `${section} section opens`, () => expect(page.getByRole("heading", { name: section, level: 2 }).first()).toBeVisible());
    await pause(page, 900);
  }

  await say(page, "Set a minimum gross margin of 10% so very low prices need approval.");
  await tap(page.getByRole("button", { name: "Discounts & margins", exact: true }));
  const minMargin = page.getByRole("textbox", { name: /Minimum gross margin/i }).first();
  await type(minMargin, "10");
  await tap(page.getByRole("button", { name: /^Save discounts/i }));
  await check(page, "Minimum margin saved", () => expect(page.getByText("Settings saved").filter({ visible: true }).first()).toBeVisible());
  await finish(page);
});
