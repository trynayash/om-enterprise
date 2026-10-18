import { SACHIN, TEST_ITEM, YASH, check, expect, finish, follow, inr, newRecordedPage, pause, say, setup, signIn, tap, test, titleCard, type } from "./kit";

setup();

test("08 · Counter sale end to end: discount approval, UPI QR, UTR check, GST tax invoice, PDF, share", async ({ page, browser }) => {
  await page.goto("/login");
  await titleCard(
    page,
    "08",
    "A complete counter sale",
    "Sachin sells 2 boxes of the TEST pipe, gives 8% off (above his 5% limit), Yash approves from his phone/office, the customer pays by UPI, Sachin checks the UTR, and a GST tax invoice is issued, printed and shared.",
  );

  await say(page, "Sachin's first sign-in: he sets his own password and lands on the counter (POS).");
  await signIn(page, { username: SACHIN.username, password: SACHIN.temp });
  await type(page.locator("#cur"), SACHIN.temp);
  await type(page.locator("#new"), SACHIN.password);
  await type(page.locator("#conf"), SACHIN.password);
  await tap(page.getByRole("button", { name: "Save new password" }));
  await page.waitForURL(/\/pos$/);
  await check(page, "Sales staff land on the POS", () => expect(page).toHaveURL(/\/pos$/));

  await say(page, "New sale.");
  await tap(page.getByTestId("new-sale"));
  await page.waitForURL(/\/pos\/sale\/[0-9a-f-]{36}$/);
  const saleNumber = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
  await check(page, `Sale number ${saleNumber} created`, () => expect(saleNumber).toMatch(/^S\d{6}$/));

  await say(page, "Search by name, size or SKU, then choose the exact variant.");
  await type(page.locator("#pos-search"), "TEST Pressure");
  await check(page, "Search finds the item with its price", () => expect(page.getByRole("option").filter({ hasText: TEST_ITEM.sku })).toContainText("₹"));
  await tap(page.getByRole("option").filter({ hasText: TEST_ITEM.sku }));

  await say(page, "Choose the unit: Box (= 10 pieces). Quantity 2 boxes.");
  const unit = page.locator("#add-unit");
  await unit.selectOption({ label: (await unit.locator("option").allTextContents()).find((o) => o.startsWith("Box"))! });
  await type(page.locator("#add-qty"), "2");
  await check(page, "Price per box shown", () => expect(page.getByText(/\/ Box/).filter({ visible: true }).first()).toBeVisible());
  await tap(page.getByRole("button", { name: "Add to cart" }));
  const cart = page.getByRole("region", { name: "Cart" });
  await check(page, "2 boxes in the cart", () => expect(cart.getByText(TEST_ITEM.product)).toBeVisible());
  const listTotal = inr(await page.getByTestId("grand-total").textContent());
  await check(page, `Total calculated on the server: ₹${listTotal.toFixed(2)}`, () => expect(listTotal).toBeGreaterThan(0));

  await say(page, "The customer asks for 8% off — above Sachin's 5% limit.");
  await tap(cart.getByRole("button", { name: "Discount" }));
  await type(page.locator("#disc-value"), "8");
  await check(page, "Warning: above his 5% limit", () => expect(page.getByText(/above your 5% limit/)).toBeVisible());
  await type(page.locator("#disc-reason"), "Regular contractor");
  await tap(page.getByRole("button", { name: "Apply discount" }));
  const discounted = Math.round(listTotal * 0.92 * 100) / 100;
  await check(page, `New total ≈ ₹${discounted.toFixed(2)} (8% off)`, () =>
    expect.poll(async () => Math.abs(inr(await page.getByTestId("grand-total").textContent()) - discounted)).toBeLessThan(1.01),
  );
  const approval = page.getByRole("region", { name: "Approval required" });
  await check(page, "Approval required before finalising", () => expect(approval).toBeVisible());
  await check(page, "Finalise button is locked", () => expect(page.getByTestId("finalize")).toBeDisabled());

  await say(page, "Sachin sends an approval request with a reason.");
  await tap(approval.getByRole("button", { name: "Request approval" }));
  await type(page.locator("#reason-text"), "Contractor buys every month");
  await tap(page.getByRole("button", { name: "Send request" }));
  await check(page, "Waiting for approval", () => expect(approval.getByText(/Waiting for approval/)).toBeVisible());

  // Yash, on another device
  const yash = await newRecordedPage(browser);
  follow(yash, page);
  await yash.goto("/login");
  await say(yash, "Meanwhile, on Yash's computer: he opens Approvals.");
  await signIn(yash, YASH);
  await yash.goto("/dashboard/approvals");
  const req = yash.locator("div").filter({ has: yash.getByRole("link", { name: saleNumber }) }).filter({ has: yash.getByRole("button", { name: "Approve" }) }).last();
  await check(yash, "Request shows the reason, the items and the discount", async () => {
    await expect(req.getByText("Contractor buys every month")).toBeVisible();
    await expect(req.getByText(/8\.00%/).filter({ visible: true }).first()).toBeVisible();
  });
  await say(yash, "He approves. The approval is tied to this exact cart.");
  await tap(req.getByRole("button", { name: "Approve" }));
  await check(yash, "Approved", () => expect(yash.getByRole("link", { name: saleNumber })).toHaveCount(0));
  await yash.context().close();

  await say(page, "Back at the counter, Sachin's screen updates by itself.");
  await check(page, "Approval received on the POS", () => expect(page.getByText(/Discount approved by Yash/)).toBeVisible({ timeout: 15_000 }));

  await say(page, "The customer agrees the final amount; prices are now locked.");
  await tap(page.getByTestId("finalize"));
  await pause(page, 1200);
  await tap(page.getByRole("button", { name: /Customer agrees/ }));
  const due = page.getByTestId("amount-due");
  await due.waitFor();
  const amount = inr(await due.textContent());
  await check(page, `Amount due ₹${amount.toFixed(2)}`, () => expect(Math.abs(amount - discounted)).toBeLessThan(1.01));

  await say(page, "UPI QR for exactly the amount due. Showing the QR is NOT proof of payment.");
  await tap(page.getByRole("button", { name: /Show UPI QR for/ }));
  await check(page, "QR shown for the exact amount", async () => {
    await expect(page.getByTestId("upi-qr")).toBeVisible();
    expect(inr(await page.getByTestId("qr-amount").textContent())).toBe(amount);
  });
  await check(page, "Still marked 'Not paid yet'", () => expect(page.getByText("Not paid yet.")).toBeVisible());
  await pause(page, 1500);

  await say(page, "Sachin checks the shop's UPI app, then records the 12-digit UTR.");
  await tap(page.getByRole("button", { name: "Payment received — verify" }));
  await type(page.locator("#pay-ref"), "12345");
  await check(page, "Short UTR rejected", () => expect(page.getByText("UPI references are 12 digits")).toBeVisible());
  const utr = String(Date.now()).slice(-12);
  await type(page.locator("#pay-ref"), utr);
  const confirm = page.getByRole("button", { name: /^Confirm .* received$/ });
  await check(page, "Can't confirm without ticking 'I have checked'", () => expect(confirm).toBeDisabled());
  await page.getByTestId("confirm-received").check();
  await pause(page, 800);
  await tap(confirm);

  await say(page, "Customer details for the bill.");
  await page.getByRole("region", { name: "Customer and bill" }).waitFor();
  await type(page.locator("#c-name"), "Ramesh Patel");
  await type(page.locator("#c-mobile"), "9825012345");
  await tap(page.getByRole("button", { name: "Generate bill" }));
  await page.waitForURL(/\/pos\/documents\/[0-9a-f-]{36}$/);
  const docId = page.url().split("/").pop()!;
  await check(page, "GST Tax Invoice issued", () => expect(page.getByRole("heading", { level: 1 })).toContainText(/Tax Invoice/i));
  await check(page, "Number by financial year (OE/26-27/…)", () => expect(page.getByText(/OE\/\d{2}-\d{2}\/\d+/).filter({ visible: true }).first()).toBeVisible());
  await check(page, "Customer, UTR-verified payment and GST shown on the bill", async () => {
    await expect(page.getByText("Ramesh Patel").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(/CGST/).filter({ visible: true }).first()).toBeVisible();
  });
  await check(page, "Not a training bill", () => expect(page.getByText(/NOT A VALID BILL/)).toHaveCount(0));

  await say(page, "Print (A4) and PDF download.");
  await check(page, "Print button", () => expect(page.getByRole("button", { name: "Print" })).toBeVisible());
  await check(page, "PDF downloads", async () => {
    const pdf = await page.request.get(`/api/documents/${docId}/pdf`);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  });

  await say(page, "Share on WhatsApp: the customer gets a private link to view and download the bill.");
  const wa = await page.getByRole("link", { name: "WhatsApp" }).getAttribute("href");
  const token = decodeURIComponent(wa ?? "").match(/\/d\/([A-Za-z0-9_-]{20,})/)?.[1];
  await check(page, "WhatsApp message contains the bill link", () => expect(token).toBeTruthy());
  const customer = await newRecordedPage(browser, { mobile: true });
  follow(customer, page);
  await customer.goto(`/d/${token}`);
  await say(customer, "What the customer sees on their phone.");
  await check(customer, "Customer can open the bill", () => expect(customer.getByText(/OE\/\d{2}-\d{2}\/\d+/).filter({ visible: true }).first()).toBeVisible());
  await check(customer, "Customer link is not indexed by search engines", () => expect(customer.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/));
  await customer.context().close();
  await finish(page);
});
