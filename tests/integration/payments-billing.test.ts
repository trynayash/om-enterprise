import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { auditLogs, documents, payments } from "@/server/db/schema";
import { getSettings, saveSettings } from "@/server/settings";
import { proposePrice } from "@/server/services/pricing";
import { addLine, createSale, finalizeSale, getSale } from "@/server/services/sales";
import {
  handleGatewayWebhook,
  recordVerifiedPayment,
  reversePayment,
  startUpiPayment,
} from "@/server/services/payments";
import { cancelBill, createReturn, getDocument, issueBill, issueQuotation, saveSaleCustomer } from "@/server/services/documents";
import { listDocuments } from "@/server/services/documents";
import { productPerformance, salesSummary } from "@/server/services/reports";
import { gstinCheckChar } from "@/lib/india";
import { D } from "@/lib/money";
import type { Actor } from "@/server/auth/actor";
import { dbErrorMessage, makeItem, makeUser, rejects, setRegistration } from "./helpers";

const SHOP_GSTIN = `24ABCDE1234F1Z${gstinCheckChar("24ABCDE1234F1Z")}`;
const BUYER_GSTIN = `24PQRST5678K1Z${gstinCheckChar("24PQRST5678K1Z")}`;
let utrCounter = 100000000000 + Math.floor(Math.random() * 800000000000);
const utr = () => String(utrCounter++);

async function patchSettings<K extends "payments" | "business" | "tax" | "discounts">(section: K, patch: Record<string, unknown>) {
  const current = await getSettings(section);
  await getDb().transaction((tx) => saveSettings(tx, { userId: null, label: "test" }, section, { ...current, ...patch }));
}

async function finalizedSale(seller: Actor, admin: Actor, opts: { price?: string; qty?: string; isSample?: boolean; cost?: string } = {}) {
  const price = opts.price ?? "1180";
  const item = await makeItem(admin, { price, cost: opts.cost ?? D(price).times("0.5").toFixed(2), isSample: opts.isSample });
  const sale = await createSale(seller);
  await addLine(seller, sale.id, { variantId: item.variantId, quantity: opts.qty ?? "1" });
  const s = await finalizeSale(seller, sale.id);
  return { sale: s, item };
}

async function payInFull(actor: Actor, saleId: string) {
  const { sale } = await getSale(actor, saleId);
  return recordVerifiedPayment(actor, saleId, {
    method: "cash",
    amount: D(sale.grandTotal).minus(D(sale.amountPaid)).toFixed(2),
    verificationMethod: "cash_counted",
    confirmReceived: true,
  });
}

const testStart = new Date(Date.now() - 1000);

beforeAll(async () => {
  await setRegistration("regular");
  await patchSettings("payments", { upiEnabled: true, upiVpa: "omenterprise@okaxis", upiPayeeName: "OM ENTERPRISE", gatewayProvider: "none" });
  await patchSettings("business", { gstin: SHOP_GSTIN });
});

describe("payment QR & verification", () => {
  it("the QR encodes exactly the finalised payable amount and merchant details", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const { sale } = await finalizedSale(sachin, kishan, { price: "1180", qty: "3" });
    const p = await startUpiPayment(sachin, sale.id);
    expect(p.amount).toBe("3540.00");
    expect(p.qrPayload).toContain("pa=omenterprise%40okaxis");
    expect(p.qrPayload).toContain("am=3540.00");
    expect(p.qrPayload).toContain("cu=INR");
    expect(p.qrPayload).toContain(encodeURIComponent(sale.saleNumber));
    expect(p.status).toBe("initiated");
    // Re-requesting returns the same QR rather than a duplicate
    const again = await startUpiPayment(sachin, sale.id);
    expect(again.id).toBe(p.id);
  });

  it("cannot take payment before the amount is finalised", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const item = await makeItem(kishan, { price: "100" });
    const sale = await createSale(sachin);
    await addLine(sachin, sale.id, { variantId: item.variantId, quantity: "1" });
    expect((await rejects(startUpiPayment(sachin, sale.id))).message).toMatch(/Finalise/);
  });

  it("an unverified QR never marks the sale paid and the bill cannot be issued", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const { sale } = await finalizedSale(sachin, kishan);
    await startUpiPayment(sachin, sale.id);
    const s = (await getSale(sachin, sale.id)).sale;
    expect(s.paymentStatus).toBe("unpaid");
    expect(s.amountPaid).toBe("0.00");
    expect((await rejects(issueBill(sachin, sale.id))).message).toMatch(/unpaid/);
  });

  it("manual verification needs explicit confirmation and a valid 12-digit UTR", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const { sale } = await finalizedSale(sachin, kishan);
    const qr = await startUpiPayment(sachin, sale.id);
    const base = { method: "upi" as const, amount: qr.amount, paymentId: qr.id, verificationMethod: "manual_merchant_app" as const };
    expect((await rejects(recordVerifiedPayment(sachin, sale.id, { ...base, reference: utr(), confirmReceived: false }))).message).toMatch(/Confirm/);
    expect((await rejects(recordVerifiedPayment(sachin, sale.id, { ...base, reference: "12345", confirmReceived: true }))).message).toMatch(/12-digit/);
    expect((await rejects(recordVerifiedPayment(sachin, sale.id, { ...base, amount: "1.00", reference: utr(), confirmReceived: true }))).message).toMatch(/QR was for/);
    const ref = utr();
    const res = await recordVerifiedPayment(sachin, sale.id, { ...base, reference: ref, confirmReceived: true });
    expect(res.paymentStatus).toBe("paid");
    expect(res.payment.verifiedBy).toBe(sachin.id);
    expect(res.payment.verificationMethod).toBe("manual_merchant_app");
    expect(res.payment.reference).toBe(ref);
  });

  it("the same UTR cannot confirm two different payments", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const a = await finalizedSale(sachin, kishan);
    const b = await finalizedSale(sachin, kishan);
    const ref = utr();
    await recordVerifiedPayment(sachin, a.sale.id, { method: "upi", amount: a.sale.grandTotal, reference: ref, verificationMethod: "manual_merchant_app", confirmReceived: true });
    const e = await rejects(recordVerifiedPayment(sachin, b.sale.id, { method: "upi", amount: b.sale.grandTotal, reference: ref, verificationMethod: "manual_merchant_app", confirmReceived: true }));
    expect(`${e.message} ${(e as { cause?: Error }).cause?.message ?? ""}`).toMatch(/payments_reference_uq|duplicate/);
  });

  it("rejects overpayment and supports split payments", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const { sale } = await finalizedSale(sachin, kishan, { price: "1000", qty: "2" });
    expect((await rejects(recordVerifiedPayment(sachin, sale.id, { method: "cash", amount: "2000.01", verificationMethod: "cash_counted", confirmReceived: true }))).message).toMatch(/outstanding/);
    const r1 = await recordVerifiedPayment(sachin, sale.id, { method: "cash", amount: "500", tenderedAmount: "500", verificationMethod: "cash_counted", confirmReceived: true });
    expect(r1.paymentStatus).toBe("partially_paid");
    const r2 = await recordVerifiedPayment(sachin, sale.id, { method: "upi", amount: "1500", reference: utr(), verificationMethod: "manual_bank_statement", confirmReceived: true });
    expect(r2.paymentStatus).toBe("paid");
  });

  it("only authorised users can reverse a wrongly confirmed payment; it is kept, not deleted", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const { sale } = await finalizedSale(sachin, kishan);
    const { payment } = await payInFull(sachin, sale.id);
    expect((await rejects(reversePayment(sachin, payment.id, "customer's payment bounced"))).message).toMatch(/permission/);
    await reversePayment(kishan, payment.id, "cash was counterfeit");
    const s = (await getSale(kishan, sale.id)).sale;
    expect(s.paymentStatus).toBe("unpaid");
    const [row] = await getDb().select().from(payments).where(eq(payments.id, payment.id));
    expect(row.status).toBe("reversed");
    expect(await dbErrorMessage(getDb().delete(payments).where(eq(payments.id, payment.id)))).toMatch(/not permitted/);
    expect(await dbErrorMessage(getDb().update(payments).set({ amount: "1.00" }).where(eq(payments.id, payment.id)))).toMatch(/immutable/);
  });
});

describe("gateway webhook (Razorpay format) — signature & idempotency", () => {
  const secret = "whsec_test_123456";
  beforeAll(async () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_key";
    process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
    process.env.RAZORPAY_WEBHOOK_SECRET = secret;
    await patchSettings("payments", { gatewayProvider: "razorpay" });
  });
  afterAll(async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    await patchSettings("payments", { gatewayProvider: "none" });
    vi.unstubAllGlobals();
  });

  function webhook(body: object, eventId: string, sig?: string) {
    const raw = JSON.stringify(body);
    const headers = new Headers({
      "x-razorpay-signature": sig ?? createHmac("sha256", secret).update(raw).digest("hex"),
      "x-razorpay-event-id": eventId,
    });
    return handleGatewayWebhook("razorpay", raw, headers);
  }

  it("creates a single-use QR for the exact amount and confirms payment only from a signed event, once", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const { sale } = await finalizedSale(sachin, kishan, { price: "2360" });
    let sentBody: Record<string, unknown> = {};
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ id: "qr_TEST" + sale.saleNumber, image_url: "https://rzp.io/i/x", status: "active", close_by: Math.floor(Date.now() / 1000) + 900 }), { status: 200 });
    });
    const p = await startUpiPayment(sachin, sale.id);
    expect(sentBody.payment_amount).toBe(236000);
    expect(sentBody.usage).toBe("single_use");
    expect(sentBody.fixed_amount).toBe(true);
    expect(p.provider).toBe("razorpay");

    const event = {
      event: "qr_code.credited",
      payload: {
        payment: { entity: { id: `pay_${sale.saleNumber}`, amount: 236000, currency: "INR", status: "captured", acquirer_data: { rrn: "123456789012" } } },
        qr_code: { entity: { id: p.providerOrderId } },
      },
    };
    expect((await webhook(event, "evt_bad", "0".repeat(64))).outcome).toBe("invalid_signature");
    expect((await getSale(kishan, sale.id)).sale.paymentStatus).toBe("unpaid");

    const first = await webhook(event, `evt_${sale.saleNumber}`);
    expect(first.outcome).toBe("processed");
    const dup = await webhook(event, `evt_${sale.saleNumber}`);
    expect(dup.outcome).toBe("duplicate");
    const replay = await webhook(event, `evt_${sale.saleNumber}_retry`);
    expect(replay.outcome).toBe("already_settled");

    const rows = await getDb().select().from(payments).where(eq(payments.saleId, sale.id));
    expect(rows.filter((r) => r.status === "successful")).toHaveLength(1);
    expect(rows[0].verificationMethod).toBe("gateway_webhook");
    expect((await getSale(kishan, sale.id)).sale.amountPaid).toBe("2360.00");
  });

  it("does not mark paid when the gateway amount differs", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const { sale } = await finalizedSale(sachin, kishan, { price: "500" });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ id: "qr_MISMATCH" + sale.saleNumber, close_by: Math.floor(Date.now() / 1000) + 900 }), { status: 200 }));
    const p = await startUpiPayment(sachin, sale.id);
    const res = await webhook(
      { event: "qr_code.credited", payload: { payment: { entity: { id: `pay_x${sale.saleNumber}`, amount: 100, currency: "INR", status: "captured" } }, qr_code: { entity: { id: p.providerOrderId } } } },
      `evt_mm_${sale.saleNumber}`,
    );
    expect(res.outcome).toBe("amount_mismatch");
    expect((await getSale(kishan, sale.id)).sale.paymentStatus).toBe("unpaid");
  });
});

describe("billing documents", () => {
  it("issues a GST tax invoice with a compliant number and frozen snapshot", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const { sale } = await finalizedSale(sachin, kishan, { price: "1180", qty: "2" });
    await payInFull(sachin, sale.id);
    const doc = await issueBill(sachin, sale.id, { customer: { name: "Ramesh Patel", mobile: "+91 98250 12345", city: "Naswadi", stateCode: "24" } });
    expect(doc.docType).toBe("tax_invoice");
    expect(doc.docNumber).toMatch(/^OE\/\d{2}-\d{2}\/\d{5}$/);
    expect(doc.docNumber.length).toBeLessThanOrEqual(16);
    const view = await getDocument(sachin, doc.id);
    expect(view.snapshot.title).toBe("TAX INVOICE");
    expect(view.snapshot.seller.gstin).toBe(SHOP_GSTIN);
    expect(view.snapshot.buyer?.mobile).toBe("9825012345");
    expect(view.snapshot.totals.grandTotal).toBe("2360.00");
    expect(view.snapshot.totals.cgst).toBe("180.00");
    expect(view.snapshot.paymentStatus).toBe("Paid");
    expect(view.snapshot.totals.amountInWords).toBe("Rupees Two Thousand Three Hundred Sixty Only");
    expect((await getSale(sachin, sale.id)).sale.status).toBe("completed");
  });

  it("validates customer details: GSTIN checksum, B2B details, ₹50,000 rule, place of supply", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const a = await finalizedSale(sachin, kishan);
    await payInFull(sachin, a.sale.id);
    expect((await rejects(issueBill(sachin, a.sale.id, { customer: { name: "X", gstin: "24ABCDE1234F1Z0" } }))).message).toMatch(/check digit|GSTIN/);
    expect((await rejects(issueBill(sachin, a.sale.id, { customer: { name: "Builder Co", gstin: BUYER_GSTIN } }))).message).toMatch(/name, address and state/);
    expect((await rejects(issueBill(sachin, a.sale.id, { customer: { name: "Out of state", billingAddress: "Indore", stateCode: "23" } }))).message).toMatch(/place of supply/);
    const ok = await issueBill(sachin, a.sale.id, { customer: { name: "Builder Co", gstin: BUYER_GSTIN, billingAddress: "GIDC, Vadodara" } });
    expect((await getDocument(kishan, ok.id)).snapshot.buyer?.stateCode).toBe("24");

    const big = await finalizedSale(sachin, kishan, { price: "60000" });
    await payInFull(sachin, big.sale.id);
    expect((await rejects(issueBill(sachin, big.sale.id, { customer: { name: "Walk-in" } }))).message).toMatch(/₹50,000|50000|or more/);
    await issueBill(sachin, big.sale.id, { customer: { name: "Mahesh Rathwa", billingAddress: "Bodeli Road", stateCode: "24" } });
  });

  it("invoice numbers stay unique and gapless under concurrent issuing", async () => {
    const kishan = await makeUser("super_admin");
    const sales = [];
    for (let i = 0; i < 12; i++) {
      const { sale } = await finalizedSale(kishan, kishan, { price: "100" });
      await payInFull(kishan, sale.id);
      sales.push(sale);
    }
    const docs = await Promise.all(sales.map((s) => issueBill(kishan, s.id)));
    const seqs = docs.map((d) => d.seq).sort((a, b) => a - b);
    expect(new Set(docs.map((d) => d.docNumber)).size).toBe(12);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBe(seqs[i - 1] + 1);
  });

  it("historical documents never change — not after a price change, not after a settings change, not via SQL", async () => {
    const kishan = await makeUser("super_admin");
    const { sale, item } = await finalizedSale(kishan, kishan, { price: "1500" });
    await payInFull(kishan, sale.id);
    const doc = await issueBill(kishan, sale.id);
    await proposePrice(kishan, { variantId: item.variantId, price: "1999", priceIncludesTax: true, reason: "increase" });
    await patchSettings("business", { name: "OM ENTERPRISE (renamed)" });
    const again = await getDocument(kishan, doc.id);
    expect(again.snapshot.totals.grandTotal).toBe("1500.00");
    expect(again.snapshot.seller.name).toBe("OM ENTERPRISE");
    await patchSettings("business", { name: "OM ENTERPRISE" });
    expect(await dbErrorMessage(getDb().update(documents).set({ grandTotal: "1.00" }).where(eq(documents.id, doc.id)))).toMatch(/cannot be altered/);
    expect(await dbErrorMessage(getDb().update(documents).set({ docNumber: "OE/00-00/99999" }).where(eq(documents.id, doc.id)))).toMatch(/cannot be altered/);
    expect(await dbErrorMessage(getDb().delete(documents).where(eq(documents.id, doc.id)))).toMatch(/not permitted/);
  });

  it("cancelling a paid bill requires a recorded refund and keeps the document and audit trail", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const { sale } = await finalizedSale(sachin, kishan, { price: "800" });
    await payInFull(sachin, sale.id);
    const doc = await issueBill(sachin, sale.id);
    expect((await rejects(cancelBill(sachin, doc.id, { reason: "wrong item" }))).message).toMatch(/permission/);
    expect((await rejects(cancelBill(kishan, doc.id, { reason: "goods not supplied" }))).message).toMatch(/refund/);
    await cancelBill(kishan, doc.id, { reason: "goods not supplied", refund: { method: "cash" } });
    const d = await getDocument(kishan, doc.id);
    expect(d.status).toBe("cancelled");
    expect(d.snapshot.number).toBe(doc.docNumber);
    const s = (await getSale(kishan, sale.id)).sale;
    expect(s.status).toBe("cancelled");
    expect(s.paymentStatus).toBe("refunded");
    const logs = await getDb().select().from(auditLogs).where(eq(auditLogs.entityId, doc.id));
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(["document.issue", "document.cancel"]));
  });

  it("returns create a credit note referencing the original bill with exact proportional amounts", async () => {
    const kishan = await makeUser("super_admin");
    const { sale } = await finalizedSale(kishan, kishan, { price: "1180", qty: "4" });
    await payInFull(kishan, sale.id);
    const inv = await issueBill(kishan, sale.id);
    const line = (await getSale(kishan, sale.id)).lines[0];
    const cn = await createReturn(kishan, sale.id, { lines: [{ saleLineId: line.id, quantity: "1" }], reason: "Damaged bucket", refund: { method: "cash" } });
    const snap = (await getDocument(kishan, cn.id)).snapshot;
    expect(cn.docType).toBe("credit_note");
    expect(cn.docNumber).toMatch(/^CN\//);
    expect(snap.original?.number).toBe(inv.docNumber);
    expect(snap.totals.grandTotal).toBe("1180.00");
    expect(snap.totals.taxable).toBe("1000.00");
    expect(snap.totals.cgst).toBe("90.00");
    const s = (await getSale(kishan, sale.id)).sale;
    expect(s.amountRefunded).toBe("1180.00");
    expect(s.paymentStatus).toBe("partially_refunded");
    // Can't return more than was sold
    expect((await rejects(createReturn(kishan, sale.id, { lines: [{ saleLineId: line.id, quantity: "4" }], reason: "too many", refund: { method: "cash" } }))).message).toMatch(/at most 3/);
    // Return the rest: totals reconcile exactly with the original invoice
    await createReturn(kishan, sale.id, { lines: [{ saleLineId: line.id, quantity: "3" }], reason: "Order cancelled", refund: { method: "cash" } });
    const after = (await getSale(kishan, sale.id)).sale;
    expect(after.amountRefunded).toBe("4720.00");
    expect(after.paymentStatus).toBe("refunded");
  });

  it("quotations hold prices for their validity period", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const item = await makeItem(kishan, { price: "2000" });
    const sale = await createSale(sachin);
    await addLine(sachin, sale.id, { variantId: item.variantId, quantity: "1" });
    const q = await issueQuotation(sachin, sale.id, { name: "Contractor Jagdish", mobile: "9876543210" });
    expect(q.docNumber).toMatch(/^QT\//);
    await proposePrice(kishan, { variantId: item.variantId, price: "2200", priceIncludesTax: true, reason: "increase" });
    const s = await finalizeSale(sachin, sale.id);
    expect(s.grandTotal).toBe("2000.00"); // quoted price honoured
  });

  it("composition registration issues a Bill of Supply with the mandatory declaration and no tax", async () => {
    await setRegistration("composition");
    try {
      const kishan = await makeUser("super_admin");
      const { sale } = await finalizedSale(kishan, kishan, { price: "1180" });
      await payInFull(kishan, sale.id);
      const doc = await issueBill(kishan, sale.id);
      const snap = (await getDocument(kishan, doc.id)).snapshot;
      expect(doc.docType).toBe("bill_of_supply");
      expect(doc.docNumber).toMatch(/^BS\//);
      expect(snap.declarationTop).toBe("Composition taxable person, not eligible to collect tax on supplies");
      expect(snap.totals.taxTotal).toBe("0.00");
      expect(snap.showTax).toBe(false);
    } finally {
      await setRegistration("regular");
    }
  });
});

describe("customer asked before payment", () => {
  it("saves the customer on the agreed sale before any payment, and the bill uses it", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const { sale } = await finalizedSale(sachin, kishan);
    const c = await saveSaleCustomer(sachin, sale.id, { name: "Ramesh Patel", mobile: "98765 43210", email: "ramesh@example.com" });
    expect(c).toMatchObject({ name: "Ramesh Patel", mobile: "9876543210", email: "ramesh@example.com" });
    expect((await getSale(sachin, sale.id)).customer?.id).toBe(c!.id);
    expect((await getSale(sachin, sale.id)).payments).toHaveLength(0);

    await payInFull(sachin, sale.id);
    // The bill is issued without sending the details again.
    const doc = await issueBill(sachin, sale.id);
    expect((await getDocument(kishan, doc.id)).snapshot.buyer).toMatchObject({ name: "Ramesh Patel", mobile: "9876543210", email: "ramesh@example.com" });
  });

  it("refuses a bad mobile number or email and saves nothing", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const { sale } = await finalizedSale(sachin, kishan);
    expect((await rejects(saveSaleCustomer(sachin, sale.id, { name: "Ramesh", mobile: "12345" }))).message).toMatch(/10-digit/);
    expect((await rejects(saveSaleCustomer(sachin, sale.id, { name: "Ramesh", mobile: "9876543210", email: "not-an-email" }))).message).toMatch(/email/i);
    expect((await getSale(sachin, sale.id)).customer).toBeNull();
  });

  it("finds a missing address or wrong state now, before the customer pays", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const a = await finalizedSale(sachin, kishan);
    // A GST-registered buyer needs name, address and state on the invoice.
    expect((await rejects(saveSaleCustomer(sachin, a.sale.id, { name: "Builder Co", gstin: BUYER_GSTIN }))).message).toMatch(/name, address and state/);
    // An unregistered buyer's address decides the place of supply.
    expect((await rejects(saveSaleCustomer(sachin, a.sale.id, { name: "Out of state", billingAddress: "Indore", stateCode: "23" }))).message).toMatch(/place of supply/);
    expect((await getSale(sachin, a.sale.id)).customer).toBeNull();
    // Nothing was kept from the refused attempts, and the right details go through.
    await saveSaleCustomer(sachin, a.sale.id, { name: "Builder Co", gstin: BUYER_GSTIN, billingAddress: "GIDC, Vadodara" });

    const big = await finalizedSale(sachin, kishan, { price: "60000" });
    expect((await rejects(saveSaleCustomer(sachin, big.sale.id, { name: "Walk-in" }))).message).toMatch(/or more/);
    await saveSaleCustomer(sachin, big.sale.id, { name: "Mahesh Rathwa", billingAddress: "Bodeli Road", stateCode: "24" });
  });

  it("a walk-in with no details is allowed on a small sale; saved details can be changed or cleared", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const { sale } = await finalizedSale(sachin, kishan);
    const first = await saveSaleCustomer(sachin, sale.id, { name: "Ramesh Patel", mobile: "9876543210" });
    const renamed = await saveSaleCustomer(sachin, sale.id, { id: first!.id, name: "Ramesh K. Patel", mobile: "9876543210" });
    expect(renamed!.id).toBe(first!.id);
    expect((await getSale(sachin, sale.id)).customer?.name).toBe("Ramesh K. Patel");
    expect(await saveSaleCustomer(sachin, sale.id, null)).toBeNull();
    expect((await getSale(sachin, sale.id)).customer).toBeNull();
    await payInFull(sachin, sale.id);
    const doc = await issueBill(sachin, sale.id);
    expect((await getDocument(kishan, doc.id)).snapshot.buyer).toBeNull();
  });

  it("can't be changed once the bill is issued, and needs permission to sell", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const { sale } = await finalizedSale(sachin, kishan);
    await payInFull(sachin, sale.id);
    await issueBill(sachin, sale.id, { customer: { name: "Ramesh Patel", mobile: "9876543210" } });
    expect((await rejects(saveSaleCustomer(sachin, sale.id, { name: "Someone else" }))).message).toMatch(/after billing/);
    const other = await finalizedSale(sachin, kishan);
    const accountant = await makeUser("accountant");
    expect((await rejects(saveSaleCustomer(accountant, other.sale.id, { name: "Not allowed" }))).code).toBe("FORBIDDEN");
  });

  it("a repeat customer typed in again is the saved one: nothing saved is blanked, blanks are filled", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const mobile = `9${String(Date.now()).slice(-9)}`;
    const a = await finalizedSale(sachin, kishan);
    const first = await saveSaleCustomer(sachin, a.sale.id, { name: "Dinesh Rathwa", mobile, billingAddress: "Bodeli Road", city: "Naswadi", stateCode: "24" });

    // Same name and number, typed with fewer details on another sale: the same customer, address kept, email added.
    const b = await finalizedSale(sachin, kishan);
    const again = await saveSaleCustomer(sachin, b.sale.id, { name: " dinesh rathwa ", mobile: `${mobile.slice(0, 5)} ${mobile.slice(5)}`, email: "dinesh@example.com", stateCode: "24" });
    expect(again!.id).toBe(first!.id);
    expect(again).toMatchObject({ billingAddress: "Bodeli Road", city: "Naswadi", email: "dinesh@example.com", name: "Dinesh Rathwa" });

    // Another name on the same number is another customer.
    const c = await finalizedSale(sachin, kishan);
    const other = await saveSaleCustomer(sachin, c.sale.id, { name: "Suresh Rathwa", mobile });
    expect(other!.id).not.toBe(first!.id);
  });

  it("a bill of supply to a GST-registered buyer needs the buyer's address (Rule 49)", async () => {
    await setRegistration("composition");
    try {
      const kishan = await makeUser("super_admin");
      const { sale } = await finalizedSale(kishan, kishan);
      expect((await rejects(saveSaleCustomer(kishan, sale.id, { name: "Builder Co", gstin: BUYER_GSTIN }))).message).toMatch(/name, address and state/);
      await saveSaleCustomer(kishan, sale.id, { name: "Builder Co", gstin: BUYER_GSTIN, billingAddress: "GIDC, Vadodara" });
      await payInFull(kishan, sale.id);
      const doc = await issueBill(kishan, sale.id);
      expect(doc.docType).toBe("bill_of_supply");
      expect((await getDocument(kishan, doc.id)).snapshot.buyer).toMatchObject({ gstin: BUYER_GSTIN, address: "GIDC, Vadodara" });
    } finally {
      await setRegistration("regular");
    }
  });

  it("a bill of supply asks for no address", async () => {
    await setRegistration("composition");
    try {
      const kishan = await makeUser("super_admin");
      const { sale } = await finalizedSale(kishan, kishan, { price: "60000" });
      await saveSaleCustomer(kishan, sale.id, { name: "Mahesh Rathwa", mobile: "9876543210" });
      await payInFull(kishan, sale.id);
      const doc = await issueBill(kishan, sale.id);
      expect(doc.docType).toBe("bill_of_supply");
      expect((await getDocument(kishan, doc.id)).snapshot.buyer?.name).toBe("Mahesh Rathwa");
    } finally {
      await setRegistration("regular");
    }
  });
});

describe("customer history", () => {
  it("lists bills, counts and lifetime value per customer correctly", async () => {
    const kishan = await makeUser("super_admin");
    const { sale } = await finalizedSale(kishan, kishan, { price: "1180", qty: "2" });
    await payInFull(kishan, sale.id);
    const doc = await issueBill(kishan, sale.id, { customer: { name: "History Check Customer", mobile: "9898989898" } });
    const s = await getSale(kishan, sale.id);
    const { getCustomer, listCustomers } = await import("@/server/services/customers");
    const detail = await getCustomer(kishan, s.sale.customerId!);
    expect(detail.history[0].docNumber).toBe(doc.docNumber);
    const list = await listCustomers(kishan, "History Check Customer");
    expect(list.items[0].saleCount).toBe(1);
    expect(list.items[0].lifetimeValue).toBe("2360.00");
  });
});

describe("training data & report reconciliation", () => {
  it("a training bill before GST is confirmed is labelled as such and shows the GST it was priced with", async () => {
    await setRegistration(null);
    try {
      const kishan = await makeUser("super_admin");
      const { sale } = await finalizedSale(kishan, kishan, { price: "1180", isSample: true });
      await payInFull(kishan, sale.id);
      const doc = await issueBill(kishan, sale.id);
      const snap = (await getDocument(kishan, doc.id)).snapshot;
      expect(snap.title).toBe("TRAINING BILL");
      expect(snap.showTax).toBe(true);
      expect(snap.totals.cgst).toBe("90.00");
      expect(doc.docNumber).toMatch(/^TRN\//);
    } finally {
      await setRegistration("regular");
    }
  });

  it("sample-product sales are training records: separate numbering, watermark, excluded from reports", async () => {
    const kishan = await makeUser("super_admin");
    const p = { from: testStart, to: new Date(Date.now() + 3600_000) };
    const before = await salesSummary(kishan, p);
    const { sale } = await finalizedSale(kishan, kishan, { price: "999", isSample: true });
    expect(sale.isTraining).toBe(true);
    await payInFull(kishan, sale.id);
    const doc = await issueBill(kishan, sale.id);
    expect(doc.docNumber).toMatch(/^TRN\//);
    const snap = (await getDocument(kishan, doc.id)).snapshot;
    expect(snap.watermark).toMatch(/NOT A VALID BILL/);
    const after = await salesSummary(kishan, { ...p, to: new Date(Date.now() + 3600_000) });
    expect(after.netInvoiced).toBe(before.netInvoiced);
    expect(after.collections.received).toBe(before.collections.received);
  });

  it("reports reconcile with the underlying documents and payments", async () => {
    const kishan = await makeUser("super_admin");
    const p = { from: testStart, to: new Date(Date.now() + 3600_000) };
    const summary = await salesSummary(kishan, p);
    const all = await listDocuments(kishan, { from: p.from, to: p.to, pageSize: 200 });
    const bills = all.items.filter((d) => ["tax_invoice", "bill_of_supply", "cash_memo"].includes(d.docType) && d.status === "issued");
    const credits = all.items.filter((d) => d.docType === "credit_note" && d.status === "issued");
    const expected = bills.reduce((a, d) => a.plus(D(d.grandTotal)), D(0)).minus(credits.reduce((a, d) => a.plus(D(d.grandTotal)), D(0)));
    expect(summary.netInvoiced).toBe(expected.toFixed(2));
    expect(D(summary.netInvoiced).equals(D(summary.netRevenue).plus(D(summary.netTax)))).toBe(true);
    const perf = await productPerformance(kishan, p);
    const perfRevenue = perf.reduce((a, r) => a.plus(D(r.revenue)), D(0));
    expect(perfRevenue.toFixed(2)).toBe(summary.netRevenue); // no charges were billed in these tests
    // Profit only over lines with known cost, and labelled as gross profit
    expect(summary.profit?.note).toMatch(/not net profit/);
  });

  it("Sachin cannot see profit reports or costs", async () => {
    const sachin = await makeUser("sales");
    expect((await rejects(salesSummary(sachin, { from: testStart, to: new Date() }))).message).toMatch(/permission/);
  });
});
