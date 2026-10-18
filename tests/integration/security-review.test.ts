/**
 * Regression tests for the findings of the pre-handover security review. Each test performs the
 * attack that used to work and checks it is now refused.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { userPermissionOverrides, users } from "@/server/db/schema";
import { getSettings, saveSettings } from "@/server/settings";
import { proposePrice } from "@/server/services/pricing";
import { createProduct, updateProduct } from "@/server/services/catalog";
import { addLine, approveInPerson, createSale, finalizeSale, getSale, updateLine } from "@/server/services/sales";
import { getPayment, recordVerifiedPayment, startUpiPayment } from "@/server/services/payments";
import { issueBill, issueQuotation, recordPrint, setShareLink } from "@/server/services/documents";
import { paymentSummary } from "@/server/services/reports";
import { resetStaffPassword } from "@/server/services/users";
import { login } from "@/server/services/auth";
import { clientInfoFromHeaders } from "@/server/auth/session";
import { gstinCheckChar } from "@/lib/india";
import { D } from "@/lib/money";
import type { Actor } from "@/server/auth/actor";
import { firstCategoryId, makeItem, makeUser, reload, rejects, setRegistration, TEST_PASSWORD, uid } from "./helpers";

let utrCounter = 300000000000 + Math.floor(Math.random() * 600000000000);
const utr = () => String(utrCounter++);
/** A distinct client per test, so per-IP rate limits from other tests don't interfere. */
const freshClient = () => ({ ip: `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, userAgent: "vitest" });

async function grant(user: Actor, permission: string, by: Actor) {
  await getDb().insert(userPermissionOverrides).values({ userId: user.id, permission, effect: "grant", grantedBy: by.id });
  return reload(user);
}

async function paidBill(seller: Actor, admin: Actor) {
  const item = await makeItem(admin, { price: "1180", cost: "500" });
  const sale = await createSale(seller);
  await addLine(seller, sale.id, { variantId: item.variantId, quantity: "1" });
  const fin = await finalizeSale(seller, sale.id);
  const pay = await recordVerifiedPayment(seller, sale.id, { method: "cash", amount: fin.grandTotal, verificationMethod: "cash_counted", confirmReceived: true });
  const doc = await issueBill(seller, sale.id);
  return { saleId: sale.id, paymentId: pay.payment.id, documentId: doc.id };
}

beforeAll(async () => {
  await setRegistration("regular");
  const db = getDb();
  const payments = await getSettings("payments");
  const business = await getSettings("business");
  await db.transaction(async (tx) => {
    await saveSettings(tx, { userId: null, label: "test" }, "payments", { ...payments, upiEnabled: true, upiVpa: "omenterprise@okaxis", bankTransferEnabled: true, gatewayProvider: "none" });
    await saveSettings(tx, { userId: null, label: "test" }, "business", { ...business, gstin: `24ABCDE1234F1Z${gstinCheckChar("24ABCDE1234F1Z")}` });
  });
});

describe("in-person approval cannot be used to guess passwords", () => {
  it("wrong approver passwords lock the approver's account like failed sign-ins", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const yash = await makeUser("admin");
    const item = await makeItem(kishan, { price: "1000", cost: "300" });
    const sale = await createSale(sachin);
    const res = await addLine(sachin, sale.id, { variantId: item.variantId, quantity: "1" });
    expect(res.approvalNeeded).toBe(false);
    const { lines } = await getSale(sachin, sale.id);
    await updateLine(sachin, sale.id, lines[0].id, { discount: { type: "percent", value: "8" }, discountReason: "contractor" });

    const max = (await getSettings("security")).maxFailedLogins;
    for (let i = 0; i < max; i++) {
      const e = await rejects(approveInPerson(sachin, sale.id, (await reload(yash)).username, `wrong-${i}`, null, freshClient()));
      expect(e.message).toMatch(/incorrect/);
    }
    const [row] = await getDb().select().from(users).where(eq(users.id, yash.id));
    expect(row.lockedUntil && row.lockedUntil > new Date()).toBe(true);
    // Locked: even the right password is refused, at the counter and at sign-in.
    expect((await rejects(approveInPerson(sachin, sale.id, row.username, TEST_PASSWORD, null, freshClient()))).message).toMatch(/Too many|locked/);
    expect((await rejects(login(row.username, TEST_PASSWORD, freshClient()))).message).toMatch(/locked/);
  });

  it("a cashier is rate limited regardless of the IP address they present", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const sale = await createSale(sachin);
    const item = await makeItem(kishan, { price: "1000" });
    await addLine(sachin, sale.id, { variantId: item.variantId, quantity: "1" });
    const targets = await Promise.all([1, 2, 3, 4, 5, 6].map(() => makeUser("admin")));
    const errors: string[] = [];
    for (const t of targets) errors.push((await rejects(approveInPerson(sachin, sale.id, t.username, "wrong", null, freshClient()))).message);
    expect(errors.slice(0, 5).every((m) => /incorrect/.test(m))).toBe(true);
    expect(errors[5]).toMatch(/Too many/);
  });

  it("client IPs come from the trusted proxy hop, not a forged X-Forwarded-For entry", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
    expect(clientInfoFromHeaders(h).ip).toBe("203.0.113.9");
  });
});

describe("sample (training) items can't hide real sales", () => {
  it("real and sample items can't share a sale", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const real = await makeItem(kishan, { price: "50000" });
    const sample = await makeItem(kishan, { price: "10", isSample: true });
    const sale = await createSale(sachin);
    await addLine(sachin, sale.id, { variantId: real.variantId, quantity: "1" });
    expect((await rejects(addLine(sachin, sale.id, { variantId: sample.variantId, quantity: "1" }))).message).toMatch(/can't be in the same sale/);
    const training = await createSale(sachin);
    await addLine(sachin, training.id, { variantId: sample.variantId, quantity: "1" });
    expect((await rejects(addLine(sachin, training.id, { variantId: real.variantId, quantity: "1" }))).message).toMatch(/can't be in the same sale/);
  });

  it("only the Super Admin can mark or unmark a product as sample data", async () => {
    const kishan = await makeUser("super_admin");
    const yash = await makeUser("admin");
    const e = await rejects(createProduct(yash, { name: `Hidden ${uid()}`, categoryId: await firstCategoryId(), unitCode: "pcs", isSample: true }));
    expect(e.message).toMatch(/Only the Super Admin/);
    const real = await makeItem(kishan, { price: "100" });
    expect((await rejects(updateProduct(yash, real.productId, { isSample: true }))).message).toMatch(/Only the Super Admin/);
    // Saving the form unchanged is fine.
    await updateProduct(yash, real.productId, { isSample: false, description: "edited" });
  });
});

describe("payments need their own evidence", () => {
  it("a UPI QR can't be confirmed as 'cash' to skip the UTR", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const item = await makeItem(kishan, { price: "1180" });
    const sale = await createSale(sachin);
    await addLine(sachin, sale.id, { variantId: item.variantId, quantity: "1" });
    await finalizeSale(sachin, sale.id);
    const qr = await startUpiPayment(sachin, sale.id);
    const e = await rejects(
      recordVerifiedPayment(sachin, sale.id, { method: "cash", amount: qr.amount, paymentId: qr.id, verificationMethod: "cash_counted", confirmReceived: true }),
    );
    expect(e.message).toMatch(/UPI payment request/);
    expect((await getSale(sachin, sale.id)).sale.paymentStatus).not.toBe("paid");
  });

  it("a UTR used for UPI can't be reused as a bank-transfer reference", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const make = async () => {
      const item = await makeItem(kishan, { price: "1180" });
      const s = await createSale(sachin);
      await addLine(sachin, s.id, { variantId: item.variantId, quantity: "1" });
      return finalizeSale(sachin, s.id);
    };
    const a = await make();
    const b = await make();
    const ref = utr();
    await recordVerifiedPayment(sachin, a.id, { method: "upi", amount: a.grandTotal, reference: ref, verificationMethod: "manual_merchant_app", confirmReceived: true });
    const e = await rejects(
      recordVerifiedPayment(sachin, b.id, { method: "bank_transfer", amount: b.grandTotal, reference: ref, verificationMethod: "manual_bank_statement", confirmReceived: true }),
    );
    expect(`${e.message} ${(e as { cause?: Error }).cause?.message ?? ""}`).toMatch(/already|payments_reference_uq|duplicate/);
  });
});

describe("quoted prices", () => {
  it("a bulk-tier quote doesn't carry its price to a smaller quantity", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const item = await makeItem(kishan, { price: "360" });
    await proposePrice(kishan, { variantId: item.variantId, price: "360", priceIncludesTax: true, tiers: [{ minQty: "100", price: "330" }], reason: "bulk tier" });
    const sale = await createSale(sachin);
    await addLine(sachin, sale.id, { variantId: item.variantId, quantity: "100" });
    await issueQuotation(sachin, sale.id, { name: "Contractor", mobile: "9876543210" });
    const quoted = (await getSale(sachin, sale.id)).lines[0];
    expect(quoted.priceSource).toBe("quotation");
    expect(quoted.unitPrice).toBe("330.00");
    await updateLine(sachin, sale.id, quoted.id, { quantity: "10" });
    const after = (await getSale(sachin, sale.id)).lines[0];
    expect(after.unitPrice).toBe("360.00");
    expect(after.priceSource).toBe("price_list");
  });
});

describe("staff only reach records they may see", () => {
  it("sales staff can't share, print or read payments of another person's sale, or see shop-wide collections", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const other = await makeUser("sales");
    const bill = await paidBill(other, kishan);
    expect((await rejects(setShareLink(sachin, bill.documentId, true))).message).toMatch(/permission|not allowed|forbidden|access/i);
    expect((await rejects(recordPrint(sachin, bill.documentId, "pdf"))).message).toMatch(/permission|not allowed|forbidden|access/i);
    expect((await rejects(getPayment(sachin, bill.paymentId))).message).toMatch(/permission|not allowed|forbidden|access/i);
    const period = { from: new Date(Date.now() - 3600_000), to: new Date(Date.now() + 3600_000) };
    expect((await rejects(paymentSummary(sachin, period))).message).toMatch(/shop-wide/);
    // The owner of the sale still can.
    expect(await setShareLink(other, bill.documentId, true)).toBeTruthy();
    await paymentSummary(kishan, period);
  });

  it("cashiers without cost access don't receive below-cost signals", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const item = await makeItem(kishan, { price: "100", cost: "200" });
    const sale = await createSale(sachin);
    const evaluation = await addLine(sachin, sale.id, { variantId: item.variantId, quantity: "1" });
    expect(evaluation.totals.anyBelowCost).toBeNull();
    expect(evaluation.approvalReasons.join(" ")).toMatch(/below the allowed minimum/);
    expect(evaluation.approvalReasons.join(" ")).not.toMatch(/cost|margin/i);
    const forSachin = await getSale(sachin, sale.id);
    expect(forSachin.lines[0].belowCost).toBeNull();
    const forOwner = await getSale(kishan, sale.id);
    expect(forOwner.lines[0].belowCost).toBe(true);
  });
});

describe("account management", () => {
  it("a users.manage holder can't take over a sales account the Super Admin elevated", async () => {
    const kishan = await makeUser("super_admin");
    const manager = await grant(await makeUser("admin"), "users.manage", kishan);
    const plain = await makeUser("sales");
    const elevated = await grant(await makeUser("sales"), "payments.reverse", kishan);
    const highLimit = await makeUser("sales", { discountLimitPercent: "25.00" });
    await resetStaffPassword(manager, plain.id, "Fresh-Temp-Pass-2026!");
    for (const target of [elevated, highLimit]) {
      expect((await rejects(resetStaffPassword(manager, target.id, "Fresh-Temp-Pass-2026!"))).message).toMatch(/only the Super Admin/);
    }
    await resetStaffPassword(kishan, elevated.id, "Fresh-Temp-Pass-2026!");
    expect(D(highLimit.discountLimitPercent).toFixed(2)).toBe("25.00");
  });
});
