import { writeFileSync } from "node:fs";
import { OWNER, check, expect, filePath, finish, ready, say, setup, signIn, tap, test, titleCard } from "./kit";

setup();

test("07 · Bulk import from CSV with validation", async ({ page }) => {
  await signIn(page, OWNER, "/admin");
  await page.goto("/dashboard/import");
  await titleCard(page, "07", "Bulk import", "Products can be imported from a spreadsheet (CSV). Every row is checked first; nothing is imported while there are errors, and imported products stay unpublished until reviewed.");

  await say(page, "The import page lists the columns it accepts.");
  await check(page, "Import page with column guide", () => expect(page.getByRole("heading", { name: "Columns" })).toBeVisible());

  await say(page, "First, a file with mistakes: an unknown category and a SKU that already exists.");
  const bad = filePath("bad.csv");
  writeFileSync(bad, "product_name,category,unit,sku,variant_name,selling_price,hsn_code,gst_rate\nTEST Import Coupler,cpvc-pipes-fittings,pcs,DEMO-PNT-INT-4L,1 inch,30,3917,18\nTEST Import Tee,no-such-category,pcs,TEST-IMP-TEE,1 inch,35,3917,18\n");
  await ready(page);
  await page.locator("#csv-file").setInputFiles(bad);
  const rows = page.getByRole("table").getByRole("row");
  await check(page, "Duplicate SKU reported on its row", () => expect(rows.filter({ hasText: "DEMO-PNT-INT-4L" })).toContainText("already exists"));
  await check(page, "Unknown category reported on its row", () => expect(rows.filter({ hasText: "TEST-IMP-TEE" })).toContainText("Unknown category"));
  await check(page, "Nothing imported while there are errors", () => expect(page.getByText(/Nothing has been imported/)).toBeVisible());
  await check(page, "Import button disabled while there are errors", () => expect(page.getByRole("button", { name: /^Import \d+ variants/ })).toBeDisabled());

  await say(page, "Now a corrected file.");
  const good = filePath("good.csv");
  writeFileSync(good, "product_name,category,unit,sku,variant_name,selling_price,hsn_code,gst_rate,source_info\nTEST Import Coupler,cpvc-pipes-fittings,pcs,TEST-IMP-CPL,1 inch,30,3917,18,Walkthrough test data\nTEST Import Tee,cpvc-pipes-fittings,pcs,TEST-IMP-TEE,1 inch,35,3917,18,Walkthrough test data\n");
  await ready(page);
  await page.locator("#csv-file").setInputFiles(good);
  const importBtn = page.getByRole("button", { name: /^Import 2 variants/ });
  await check(page, "Corrected file passes validation", () => expect(importBtn).toBeEnabled());
  await tap(importBtn);
  await check(page, "Import complete", () => expect(page.getByText("Import complete")).toBeVisible());

  await say(page, "Imported products are drafts — not on the website until reviewed and published.");
  await page.goto("/dashboard/products?q=TEST%20Import");
  await check(page, "Imported products listed", () => expect(page.getByText("TEST Import Coupler").filter({ visible: true }).first()).toBeVisible());
  await check(page, "Not on the public website yet", async () => {
    const r = await page.request.get("/products?q=TEST%20Import");
    expect(await r.text()).not.toContain("TEST Import Coupler");
  });
  await finish(page);
});
