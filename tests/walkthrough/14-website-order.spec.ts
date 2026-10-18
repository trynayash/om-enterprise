import { OWNER, check, expect, finish, say, setup, signIn, tap, test, titleCard } from "./kit";

setup();

test("14 · Website order request → staff follow-up → POS sale", async ({ page }) => {
  await signIn(page, OWNER, "/admin");
  await page.goto("/dashboard/orders");
  await titleCard(page, "14", "Website orders", "Order requests sent from the website (video 02) arrive here. Staff call or WhatsApp the customer, then turn the request into a POS sale with one click. Website prices are never final until confirmed at the counter.");
  await say(page, "Ramesh's request from the website is waiting.");
  await check(page, "Order request listed with its W-number", () => expect(page.getByText(/W\d{6}/).filter({ visible: true }).first()).toBeVisible());
  await tap(page.getByRole("link", { name: /W\d{6}/ }).filter({ visible: true }).first());
  await check(page, "Order details: customer, mobile, items", async () => {
    await expect(page.getByText("Ramesh Patel").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("9825012345").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("SAMPLE Interior Emulsion").filter({ visible: true }).first()).toBeVisible();
  });
  await say(page, "Convert it into a POS sale.");
  await tap(page.getByRole("button", { name: "Convert to sale" }));
  const open = page.getByRole("link", { name: /Open sale .* in POS/ });
  await check(page, "Converted — a draft POS sale at today's prices", () => expect(open).toBeVisible());
  await tap(open);
  await page.waitForURL(/\/pos\/sale\//);
  await check(page, "The sale carries the website items", () => expect(page.getByRole("region", { name: "Cart" }).getByText("SAMPLE Interior Emulsion")).toBeVisible());
  await check(page, "Marked as coming from a website order", () => expect(page.getByText("From website order")).toBeVisible());
  await finish(page);
});
