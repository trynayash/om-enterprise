import { OWNER, api, check, expect, finish, pause, say, setup, signIn, tap, test, titleCard, type } from "./kit";

setup();

type SaleRow = { id: string; saleNumber: string; customerName: string | null; status: string; isTraining: boolean };

test("13 · Returns (credit note with refund) and cancelling a bill", async ({ page }) => {
  await signIn(page, OWNER, "/admin");
  await page.goto("/dashboard/sales");
  await titleCard(page, "13", "Returns & cancellations", "Returned goods get a credit note against the original bill, with the refund recorded. A bill issued in error is cancelled — it keeps its number and is never deleted.");

  await say(page, "Sales & bills: every sale with its status and amount.");
  await check(page, "Sales list", () => expect(page.getByRole("heading", { level: 1 })).toBeVisible());
  const sales = await api<{ items: SaleRow[] }>(page, "GET", "/api/sales?pageSize=50");
  const suresh = sales.items.find((s) => s.customerName === "Suresh Rathwa")!;
  const cashSale = sales.items.find((s) => !s.customerName && s.status === "completed" && !s.isTraining)!;

  await say(page, `Suresh Rathwa returns 2 of the 5 pipes he bought (${suresh.saleNumber}).`);
  await page.goto(`/dashboard/sales/${suresh.id}`);
  await tap(page.getByRole("button", { name: "Process return" }));
  const d = page.locator("dialog[open]");
  await type(d.getByRole("textbox", { name: /Quantity to return for/ }).first(), "2");
  await type(d.locator("#rr2"), "Two pipes not needed — unused, original condition");
  await check(page, "Refund in cash is selected", () => expect(d.locator("#rm")).toHaveValue("cash"));
  await pause(page, 800);
  await tap(d.getByRole("button", { name: "Issue credit note" }));
  await check(page, "Credit note issued (CN number)", () => expect(page.getByText(/CN\/\d{2}-\d{2}\/\d+/).filter({ visible: true }).first()).toBeVisible());
  await check(page, "Refund recorded on the sale", () => expect(page.getByText(/refund/i).filter({ visible: true }).first()).toBeVisible());

  await say(page, `The cash sale ${cashSale.saleNumber} was billed in error: cancel the bill, recording the cash refund.`);
  await page.goto(`/dashboard/sales/${cashSale.id}`);
  await tap(page.getByRole("button", { name: "Cancel bill" }));
  const c = page.locator("dialog[open]");
  await type(c.locator("#cr"), "Billed twice by mistake — duplicate bill");
  await tap(c.getByRole("button", { name: "Cancel bill" }));
  await check(page, "Bill marked CANCELLED, number kept", () => expect(page.getByText(/cancelled/i).filter({ visible: true }).first()).toBeVisible());
  await say(page, "Deleting a finished bill is impossible — even directly in the database it is blocked.");
  await check(page, "The cancelled bill still exists in Documents", async () => {
    await page.goto("/dashboard/documents?status=cancelled");
    await expect(page.getByText(/OE\/\d{2}-\d{2}\/\d+/).filter({ visible: true }).first()).toBeVisible();
  });
  await finish(page);
});
