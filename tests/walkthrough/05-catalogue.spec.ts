import sharp from "sharp";
import { OWNER, TEST_ITEM, check, filePath, expect, finish, pause, say, setup, signIn, tap, test, titleCard, type } from "./kit";

setup();

test("05 · Catalogue: brand, product, variant, units, price, cost, review, publish, image", async ({ page }) => {
  await signIn(page, OWNER, "/admin");
  await page.goto("/dashboard/categories");
  await titleCard(page, "05", "Catalogue & pricing", "Kishan adds a clearly-labelled TEST product the way a real one is added: brand, product details, a variant with its SKU, an extra selling unit, price with a bulk break, purchase cost and margin, review, publish and a photo.");

  await say(page, "Categories and brands organise the catalogue.");
  await check(page, "Categories listed", () => expect(page.getByRole("heading", { name: "Categories", level: 2 })).toBeVisible());
  await say(page, "Add a brand.");
  await tap(page.getByRole("button", { name: "New brand" }));
  const bd = page.locator("dialog[open]");
  await type(bd.getByLabel("Brand name"), "TEST Brand (walkthrough)");
  await tap(bd.getByRole("button", { name: "Create" }));
  await check(page, "Brand created", () => expect(page.getByText("TEST Brand (walkthrough)").filter({ visible: true }).first()).toBeVisible());

  await say(page, "The product list: search, filters, review status — demonstration items are marked SAMPLE.");
  await page.goto("/dashboard/products");
  await check(page, "Products listed with SAMPLE labels", () => expect(page.getByText("SAMPLE Wall Putty").filter({ visible: true }).first()).toBeVisible());
  await tap(page.getByRole("link", { name: "New product" }));
  await page.waitForURL(/\/dashboard\/products\/new/);

  await say(page, "New product: name, brand, category, HSN code, GST class and selling unit. New products start hidden from the website.");
  await type(page.locator("#p-name"), TEST_ITEM.product);
  await page.locator("#p-brand").selectOption({ label: "TEST Brand (walkthrough)" });
  const cat = page.locator("#p-cat");
  const cpvc = (await cat.locator("option").allTextContents()).find((o) => o.includes("CPVC"))!;
  await cat.selectOption({ label: cpvc });
  await type(page.locator("#p-hsn"), "3917");
  await page.locator("#p-tax").selectOption({ label: "GST 18%" });
  await type(page.locator("#p-desc"), "Walkthrough test item — not a real product. Shown to demonstrate how products are added.");
  await type(page.getByLabel("Specification 1 name"), "Pressure class");
  await type(page.getByLabel("Specification 1 value"), "TEST value (copy real values from the data sheet)");
  await type(page.locator("#p-source"), "Walkthrough test data");
  await tap(page.getByRole("button", { name: "Create product" }));
  await page.waitForURL(/\/dashboard\/products\/[0-9a-f-]{36}$/);
  await check(page, "Product created as a draft", () => expect(page.getByRole("heading", { name: TEST_ITEM.product, level: 1 })).toBeVisible());

  await say(page, "Each size is a variant with its own SKU and price.");
  await tap(page.getByRole("button", { name: "Add first variant" }));
  const vd = page.locator("dialog[open]");
  await type(vd.getByLabel("Variant name"), TEST_ITEM.variant);
  await type(vd.getByLabel("SKU"), TEST_ITEM.sku);
  await tap(vd.getByRole("button", { name: "Add variant" }));
  await check(page, "Variant added", () => expect(page.getByRole("cell", { name: TEST_ITEM.sku })).toBeVisible());

  await say(page, "Selling price ₹420 incl. GST, MRP ₹450, and a bulk break: 10 or more at ₹400 each. The reason is kept in price history.");
  await type(page.getByLabel(/Selling price per piece/), TEST_ITEM.price);
  await type(page.getByLabel("MRP (optional)"), "450");
  await tap(page.getByRole("button", { name: "Add break" }));
  await type(page.getByLabel("Minimum quantity").first(), "10");
  await type(page.getByLabel("Tier price").first(), "400");
  await type(page.getByLabel("Reason for the change"), "Walkthrough test price");
  await tap(page.getByRole("button", { name: "Save price" }));
  await check(page, "Price is live: ₹420.00 incl. GST", () => expect(page.getByText("₹420.00").filter({ visible: true }).first()).toBeVisible());

  await say(page, "Purchase cost from the supplier bill. With regular GST, purchase GST is claimed back, so it is not added to the landed cost.");
  await tap(page.getByRole("tab", { name: "Cost" }));
  await type(page.getByLabel("Purchase cost (excl. GST)"), TEST_ITEM.cost);
  await type(page.getByLabel("Freight per unit"), "5");
  await type(page.getByLabel("Source / reason"), "TEST supplier bill");
  await tap(page.getByRole("button", { name: "Record cost" }));
  await tap(page.getByRole("tab", { name: "Price" }));
  await check(page, "Landed cost ₹255.00 and margin shown", async () => {
    await expect(page.getByText("₹255.00").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(/28\.\d%/).filter({ visible: true }).first()).toBeVisible();
  });

  await say(page, "Extra selling unit: a box of 10 pieces. Only units set up here can be used at the counter — nothing is converted automatically.");
  await tap(page.getByRole("tab", { name: "Units & compatibility" }));
  await page.getByLabel("Also sell by").selectOption({ label: (await page.getByLabel("Also sell by").locator("option").allTextContents()).find((o) => o.startsWith("Box"))! });
  await type(page.getByLabel(/= how many Piece/), "10");
  await tap(page.getByRole("button", { name: "Add", exact: true }).first());
  await check(page, "Box of 10 added as a selling unit", () => expect(page.getByText(/1 Box = 10/i).filter({ visible: true }).first()).toBeVisible());

  await say(page, "History keeps every price and cost version, with who approved it.");
  await tap(page.getByRole("tab", { name: "History" }));
  await check(page, "Price history shows the approved price", () => expect(page.getByRole("row").filter({ hasText: "Walkthrough test price" }).first()).toBeVisible());

  await say(page, "Review, then publish on the website.");
  await tap(page.getByRole("button", { name: "Mark information as reviewed" }));
  await pause(page, 800);
  await tap(page.getByRole("button", { name: "Publish on website" }));
  await check(page, "Published on the website", () => expect(page.getByText("On website").filter({ visible: true }).first()).toBeVisible());

  await say(page, "Add a product photo (images are re-encoded and stripped of metadata).");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#0b1b33"/><text x="400" y="290" font-size="64" font-family="sans-serif" fill="#d4a537" text-anchor="middle">TEST IMAGE</text><text x="400" y="360" font-size="28" font-family="sans-serif" fill="#ffffff" text-anchor="middle">not a real product photo</text></svg>`;
  const img = filePath("test-photo.png");
  await sharp(Buffer.from(svg)).png().toFile(img);
  await page.locator('input[type=file]').first().setInputFiles(img);
  await type(page.getByLabel("Image description (alt text)").first(), "TEST image for the walkthrough");
  await tap(page.getByRole("button", { name: "Upload images" }));
  await check(page, "Photo uploaded", () => expect(page.locator('img[src^="/uploads/"]').first()).toBeVisible());

  await say(page, "The public website now shows the product with its price — no SAMPLE warning, because it isn't sample data.");
  await page.goto("/products/test-pressure-pipe-not-a-real-product");
  await check(page, "Public product page shows the new product", () => expect(page.getByRole("heading", { name: TEST_ITEM.product })).toBeVisible());
  await check(page, "Public price ₹420", () => expect(page.getByText("₹420", { exact: true }).filter({ visible: true }).first()).toBeVisible());
  await finish(page);
});
