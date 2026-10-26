import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { bootstrap } from "@/server/bootstrap";
import { getSettings, saveSettings } from "@/server/settings";
import { createProduct, createVariant } from "@/server/services/catalog";
import { proposePrice } from "@/server/services/pricing";
import { addLine, createSale, finalizeSale, getSale, updateLine } from "@/server/services/sales";
import { recordVerifiedPayment } from "@/server/services/payments";
import { getDocument, issueBill } from "@/server/services/documents";
import { renderDocumentPdf } from "@/server/pdf/document-pdf";
import { readImportFile } from "@/lib/import-files";
import { gstinCheckChar } from "@/lib/india";
import { SETTINGS_DEFAULTS, type Settings } from "@/lib/settings-schema";
import type { Actor } from "@/server/auth/actor";
import { firstCategoryId, makeUser, setRegistration, taxClassId, uid } from "./helpers";

let registrationBefore: Settings["tax"]["registrationType"];
let businessBefore: Settings["business"];
const saveBusiness = (value: Settings["business"]) => getDb().transaction((tx) => saveSettings(tx, { userId: null, label: "test" }, "business", value));

beforeAll(async () => {
  registrationBefore = (await getSettings("tax")).registrationType;
  businessBefore = await getSettings("business");
  await setRegistration("composition");
});
afterAll(async () => {
  await setRegistration(registrationBefore);
  await saveBusiness(businessBefore);
});

async function variant(admin: Actor, productId: string, name: string, price: string, mrp: string | null, attributes: Record<string, string>) {
  const v = await createVariant(admin, productId, { sku: uid("BL-").toUpperCase(), name, unitCode: "pcs", attributes });
  await proposePrice(admin, { variantId: v.id, price, priceIncludesTax: true, mrp, reason: "as on the shop's bill" });
  return v;
}

describe("a bill laid out like the shop's own (Bill of Supply 729)", () => {
  it("keeps the MRP, colour and material of each item and what the customer saved, and prints them on A4", async () => {
    const kishan = await makeUser("super_admin");
    const product = await createProduct(kishan, {
      name: `Umiya Gold 5 Layer Water Tank ${uid()}`,
      categoryId: await firstCategoryId(),
      unitCode: "pcs",
      taxClassId: await taxClassId("18"),
      hsnCode: "39251000",
    });
    const tank = await variant(kishan, product.id, "1000 L", "9700", "10000", { Capacity: "1000 L", Material: "Pure" });
    const base = await variant(kishan, product.id, "Tank base 1000 L", "2500", "2800", { Colour: "Black" });
    const plain = await variant(kishan, product.id, "Lid", "150", null, {});

    const sale = await createSale(kishan);
    for (const v of [tank, base, plain]) await addLine(kishan, sale.id, { variantId: v.id, quantity: "1" });
    const lines = (await getSale(kishan, sale.id)).lines;
    await updateLine(kishan, sale.id, lines.find((l) => l.variantId === tank.id)!.id, { discount: { type: "amount", value: "700" }, discountReason: "regular customer" });
    await updateLine(kishan, sale.id, lines.find((l) => l.variantId === base.id)!.id, { discount: { type: "amount", value: "300" }, discountReason: "regular customer" });
    const finalized = await finalizeSale(kishan, sale.id);
    expect(finalized.grandTotal).toBe("11350.00");
    await recordVerifiedPayment(kishan, sale.id, { method: "cash", amount: "11350.00", verificationMethod: "cash_counted", confirmReceived: true });
    const doc = await issueBill(kishan, sale.id, { customer: { name: "Gumanbhai Bhurabhai Vasava", mobile: "9876543210", billingAddress: "Kadikuva Vasava", stateCode: "24" } });

    const s = (await getDocument(kishan, doc.id)).snapshot;
    expect(s.docType).toBe("bill_of_supply");
    const byName = (n: string) => s.lines.find((l) => l.description.includes(n))!;
    expect(byName("1000 L")).toMatchObject({ mrp: "10000.00", material: "Pure", colour: null, discount: "700.00", total: "9000.00" });
    expect(byName("Tank base")).toMatchObject({ mrp: "2800.00", colour: "Black", material: null, total: "2200.00" });
    expect(byName("Lid")).toMatchObject({ mrp: null, colour: null, material: null });
    // MRP 12,800 for the tank and base against 11,200 paid; nothing saved on the lid.
    expect(s.totals.youSaved).toBe("1600.00");

    const pdf = await renderDocumentPdf(s, { status: "issued" });
    expect(Buffer.from(pdf).toString("latin1")).toMatch(/\/MediaBox \[0 0 595\.28 841\.89\]/); // A4
    const text = (await readImportFile("bill.pdf", new Uint8Array(pdf))).tables[0].rows.flat().join(" ");
    for (const want of [
      "HSN/SAC",
      "Colour",
      "Material",
      "MRP",
      "Unit",
      "Price/Unit",
      "10,000.00",
      "(7.22%)",
      "(12%)",
      "Black",
      "Pure",
      "Place of supply",
      "24-Gujarat",
      "Received",
      "Balance",
      "You saved",
      "₹1,600.00",
      "PAYMENT MODE",
      "AMOUNT IN WORDS",
    ]) {
      expect(text, want).toContain(want);
    }
  });
});

describe("the shop's details from its own bill", () => {
  it("replaces the first-setup address and fills an empty GSTIN once, and leaves the owner's own details alone", async () => {
    const db = getDb();
    const current = await getSettings("business");

    await saveBusiness({ ...current, addressLine1: "Opp. Shardha Dhaba 2, Bodeli Road", gstin: "" });
    await bootstrap(db);
    expect(await getSettings("business")).toMatchObject({ addressLine1: "Nr. Shivani Showroom, Bodeli Road", gstin: "24CSLPM5670H1ZF" });
    expect(SETTINGS_DEFAULTS.business).toMatchObject({ addressLine1: "Nr. Shivani Showroom, Bodeli Road", gstin: "24CSLPM5670H1ZF" });

    // The owner's own address, or a GSTIN already entered, is never replaced.
    await saveBusiness({ ...current, addressLine1: "Shop 4, Main Bazar", gstin: "" });
    await bootstrap(db);
    expect(await getSettings("business")).toMatchObject({ addressLine1: "Shop 4, Main Bazar", gstin: "" });
    const other = `24AAAAA0000A1Z${gstinCheckChar("24AAAAA0000A1Z")}`;
    await saveBusiness({ ...current, addressLine1: "Opp. Shardha Dhaba 2, Bodeli Road", gstin: other });
    await bootstrap(db);
    expect(await getSettings("business")).toMatchObject({ addressLine1: "Nr. Shivani Showroom, Bodeli Road", gstin: other });
  });
});
