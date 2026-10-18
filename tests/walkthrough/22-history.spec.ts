import { OWNER, SACHIN, api, check, expect, finish, pause, say, setup, signIn, tap, test, titleCard, type } from "./kit";

setup();

test("22 · Bills & documents history, reprints, counter pages", async ({ page }) => {
  await signIn(page, OWNER, "/admin");
  await page.goto("/dashboard/documents");
  await titleCard(page, "22", "History & reprints", "Every bill, credit note and quotation is kept exactly as issued. Search by number, customer or type; reprints are counted and logged.");
  await say(page, "All documents: tax invoices, credit notes, quotations, training bills.");
  await check(page, "Documents listed", () => expect(page.getByText(/OE\/\d{2}-\d{2}\/\d+/).filter({ visible: true }).first()).toBeVisible());
  await say(page, "Open a bill and download its PDF again — the copy is counted.");
  await tap(page.getByRole("link", { name: /OE\/\d{2}-\d{2}\/\d+/ }).filter({ visible: true }).first());
  await check(page, "Bill opens exactly as issued", () => expect(page.getByRole("button", { name: "Print" })).toBeVisible());
  const docId = page.url().split("/").pop()!;
  await check(page, "Reprint PDF works", async () => expect((await page.request.get(`/api/documents/${docId}/pdf?download=1`)).status()).toBe(200));
  await api(page, "POST", "/api/auth/logout", {});

  await signIn(page, SACHIN);
  for (const [url, label] of [["/pos/bills", "Bills"], ["/pos/payments", "Payments"], ["/pos/orders", "Website orders"], ["/pos/products", "Price lookup"]] as const) {
    await say(page, `Counter page: ${label}.`);
    await page.goto(url);
    await check(page, `${label} page opens for Sachin`, () => expect(page.getByRole("heading", { level: 1 })).toBeVisible());
    await pause(page, 900);
  }
  await say(page, "Price lookup: find any item's current price without starting a sale.");
  await type(page.getByRole("searchbox", { name: "Search products" }).or(page.getByPlaceholder("Search name, brand, size or SKU…")).first(), "TEST Pressure");
  await check(page, "Price lookup finds the item", () => expect(page.getByText("TEST-PP-25").filter({ visible: true }).first()).toBeVisible());
  await finish(page);
});
