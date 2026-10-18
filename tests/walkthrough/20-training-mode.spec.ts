import { OWNER, SACHIN, agree, api, check, expect, finish, newSaleWith, payCash, say, setup, signIn, tap, test, titleCard } from "./kit";

setup();

test("20 · Training mode: SAMPLE products make practice sales that never count", async ({ page }) => {
  await signIn(page, OWNER, "/admin");
  await titleCard(page, "20", "Training (sample) sales", "Staff can practise with SAMPLE products: those sales get TRN numbers, a 'NOT A VALID BILL' watermark, and are excluded from every report. Real and sample items can never be mixed.");
  const before = await api<{ netInvoiced: string }>(page, "GET", "/api/reports/summary");
  await api(page, "POST", "/api/auth/logout", {});
  await signIn(page, SACHIN);
  await say(page, "Sachin practises with a SAMPLE paint.");
  await newSaleWith(page, "DEMO-PNT-INT-4L", "DEMO-PNT-INT-4L", "1");
  await check(page, "Training banner shown", () => expect(page.getByText(/training/i).filter({ visible: true }).first()).toBeVisible());
  await say(page, "Trying to add a real item to a training sale is refused.");
  await page.locator("#pos-search").fill("TEST-PP-25");
  await page.locator("#pos-search").press("Enter");
  await check(page, "Real + sample mix refused", () => expect(page.getByText(/can't be in the same sale/).filter({ visible: true }).first()).toBeVisible());
  await agree(page);
  await payCash(page);
  await tap(page.getByRole("button", { name: "Cash sale — skip details" }));
  await page.waitForURL(/\/pos\/documents\//);
  await check(page, "TRN number", () => expect(page.getByText(/TRN\/\d{2}-\d{2}\/\d+/).filter({ visible: true }).first()).toBeVisible());
  await check(page, "Watermark: NOT A VALID BILL", () => expect(page.getByText(/NOT A VALID BILL/).filter({ visible: true }).first()).toBeVisible());
  await say(page, "Reports are unchanged by the training sale.");
  const after = await api<{ netInvoiced: string }>(page, "GET", "/api/reports/summary").catch(() => null);
  await check(page, "Sales staff can't read shop-wide reports", () => expect(after).toBeNull());
  await api(page, "POST", "/api/auth/logout", {});
  await signIn(page, OWNER, "/admin");
  const ownerAfter = await api<{ netInvoiced: string }>(page, "GET", "/api/reports/summary");
  await check(page, "Owner's totals unchanged by the training sale", () => expect(ownerAfter.netInvoiced).toBe(before.netInvoiced));
  await finish(page);
});
