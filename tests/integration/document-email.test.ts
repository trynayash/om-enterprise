import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { auditLogs, customers, sales } from "@/server/db/schema";
import { getSettings, saveSettings } from "@/server/settings";
import { addLine, createSale, finalizeSale } from "@/server/services/sales";
import { recordVerifiedPayment } from "@/server/services/payments";
import { cancelBill, issueBill, recordPrint, saveSaleCustomer } from "@/server/services/documents";
import { readImportFile } from "@/lib/import-files";
import { emailDocument, emailHistory, emailInfoFor, MAX_EMAILS_PER_DOCUMENT } from "@/server/services/document-email";
import { getDocument } from "@/server/services/documents";
import { gstinCheckChar } from "@/lib/india";
import { makeItem, makeUser, rejects, setRegistration } from "./helpers";

const SHOP_GSTIN = `24ABCDE1234F1Z${gstinCheckChar("24ABCDE1234F1Z")}`;
const KEY = "re_integration_key_do_not_leak";
const saved = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM, outbox: process.env.EMAIL_OUTBOX_DIR };

/** Resend, answered by the test. */
function resend(status = 200, body: unknown = { id: "msg_test" }) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const sentBody = (fetchMock: ReturnType<typeof resend>, call = 0) => JSON.parse((fetchMock.mock.calls[call] as unknown as [string, RequestInit])[1].body as string);

// Each bill gets its own customer: the same name and mobile is, rightly, the same saved customer.
let mobileCounter = 9_000_000_000 + (Date.now() % 900_000_000);
const nextMobile = () => String(mobileCounter++);

/** A bill already issued by Sachin for a customer with the given email. */
async function issuedBill(opts: { email?: string | null; sample?: boolean } = {}) {
  const kishan = await makeUser("super_admin");
  const sachin = await makeUser("sales");
  const item = await makeItem(kishan, { price: "590", cost: "300", isSample: opts.sample });
  const sale = await createSale(sachin);
  await addLine(sachin, sale.id, { variantId: item.variantId, quantity: "1" });
  const finalized = await finalizeSale(sachin, sale.id);
  await saveSaleCustomer(sachin, sale.id, { name: "Ramesh Patel", mobile: nextMobile(), email: opts.email === undefined ? "ramesh@example.com" : opts.email });
  await recordVerifiedPayment(sachin, sale.id, { method: "cash", amount: finalized.grandTotal, verificationMethod: "cash_counted", confirmReceived: true });
  const doc = await issueBill(sachin, sale.id);
  return { kishan, sachin, sale, doc };
}

beforeAll(async () => {
  await setRegistration("regular");
  const business = await getSettings("business");
  await getDb().transaction((tx) => saveSettings(tx, { userId: null, label: "test" }, "business", { ...business, gstin: SHOP_GSTIN, email: "shop@example.com" }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env.RESEND_API_KEY = KEY;
  process.env.EMAIL_FROM = "OM ENTERPRISE <bills@example.com>";
  delete process.env.EMAIL_OUTBOX_DIR;
});
beforeAll(() => {
  process.env.RESEND_API_KEY = KEY;
  process.env.EMAIL_FROM = "OM ENTERPRISE <bills@example.com>";
  delete process.env.EMAIL_OUTBOX_DIR;
});
afterAll(() => {
  for (const [k, v] of [
    ["RESEND_API_KEY", saved.key],
    ["EMAIL_FROM", saved.from],
    ["EMAIL_OUTBOX_DIR", saved.outbox],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("emailing a bill", () => {
  it("sends the bill as a PDF to the customer's address on it, and records it", async () => {
    const { sachin, doc } = await issuedBill();
    const fetchMock = resend();
    const r = await emailDocument(sachin, doc.id);
    expect(r).toMatchObject({ to: "ramesh@example.com", id: "msg_test", sentBefore: 0 });
    const body = sentBody(fetchMock);
    expect(body).toMatchObject({ from: "OM ENTERPRISE <bills@example.com>", to: ["ramesh@example.com"], reply_to: "shop@example.com" });
    expect(body.subject).toBe(`Tax Invoice ${doc.docNumber} from OM ENTERPRISE`);
    expect(body.text).toContain("Hello Ramesh Patel,");
    const [pdf] = body.attachments;
    expect(pdf.filename).toBe(`${doc.docNumber.replace(/\//g, "-")}.pdf`);
    expect(Buffer.from(pdf.content, "base64").subarray(0, 4).toString()).toBe("%PDF");

    const history = await emailHistory(doc.id);
    expect(history).toMatchObject({ to: "ramesh@example.com", count: 1 });
    const [log] = await getDb()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, doc.id), eq(auditLogs.action, "document.email")));
    // The log line does not spell the address out; the record of it is in the data.
    expect(log.summary).toBe(`Emailed ${doc.docNumber} to r***@example.com`);
    expect(log.data).toMatchObject({ to: "ramesh@example.com", providerId: "msg_test" });
    expect(await emailInfoFor({ ...(await getDocument(sachin, doc.id)) })).toMatchObject({ ready: true, buyerEmail: "ramesh@example.com", last: { to: "ramesh@example.com", count: 1 } });
  });

  it("sends to a typed address instead, and keeps it on a customer who had none (never over one who had)", async () => {
    const none = await issuedBill({ email: null });
    expect((await rejects(emailDocument(none.sachin, none.doc.id))).message).toMatch(/no email address/);
    expect((await rejects(emailDocument(none.sachin, none.doc.id, { to: "not an email" }))).message).toMatch(/does not look right/);
    resend();
    await emailDocument(none.sachin, none.doc.id, { to: "ramesh.new@example.com", saveToCustomer: true });
    const [sale] = await getDb().select().from(sales).where(eq(sales.id, none.sale.id));
    expect((await getDb().select().from(customers).where(eq(customers.id, sale.customerId!)))[0].email).toBe("ramesh.new@example.com");

    const had = await issuedBill({ email: "first@example.com" });
    await emailDocument(had.sachin, had.doc.id, { to: "second@example.com", saveToCustomer: true });
    const [sale2] = await getDb().select().from(sales).where(eq(sales.id, had.sale.id));
    expect((await getDb().select().from(customers).where(eq(customers.id, sale2.customerId!)))[0].email).toBe("first@example.com");
  });

  it("does not email a practice bill, and does not email when the service is not set up", async () => {
    const practice = await issuedBill({ sample: true });
    expect(practice.doc.isTraining).toBe(true);
    const fetchMock = resend();
    expect((await rejects(emailDocument(practice.sachin, practice.doc.id))).message).toMatch(/Practice/);
    expect(await emailInfoFor({ ...(await getDocument(practice.sachin, practice.doc.id)) })).toMatchObject({ blocked: expect.stringMatching(/Practice/) });

    const real = await issuedBill();
    delete process.env.RESEND_API_KEY;
    const err = await rejects(emailDocument(real.sachin, real.doc.id));
    expect(err.code).toBe("PRECONDITION");
    expect(err.message).toMatch(/not set up/);
    expect((await emailInfoFor({ ...(await getDocument(real.sachin, real.doc.id)) }))?.ready).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("labels the emailed PDF 'Original for recipient', even after the counter printed the bill and on a second email", async () => {
    const { kishan, sachin, doc } = await issuedBill();
    await recordPrint(kishan, doc.id, "pdf");
    const fetchMock = resend();
    await emailDocument(sachin, doc.id);
    await emailDocument(sachin, doc.id);
    for (const call of [0, 1]) {
      const pdf = Buffer.from(sentBody(fetchMock, call).attachments[0].content, "base64");
      const text = (await readImportFile("bill.pdf", new Uint8Array(pdf))).tables[0].rows.flat().join(" ");
      expect(text).toContain("Original for recipient");
      expect(text).not.toMatch(/Reprint/);
    }
  });

  it("does not email a cancelled bill", async () => {
    const { kishan, sachin, doc } = await issuedBill();
    await cancelBill(kishan, doc.id, { reason: "goods not supplied", refund: { method: "cash" } });
    resend();
    expect((await rejects(emailDocument(sachin, doc.id))).message).toMatch(/cancelled/);
    expect(await emailInfoFor({ ...(await getDocument(kishan, doc.id)) })).toBeUndefined();
  });

  it("is limited to a few emails a bill, and a failed send is recorded but not counted", async () => {
    const { sachin, doc } = await issuedBill();
    const failing = resend(500, {});
    const err = await rejects(emailDocument(sachin, doc.id));
    expect(err.message).toMatch(/Nothing was sent/);
    expect(failing).toHaveBeenCalledTimes(1);
    const failed = await getDb()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, doc.id), eq(auditLogs.action, "document.email_failed")));
    expect(failed).toHaveLength(1);
    expect(JSON.stringify(failed[0])).not.toContain(KEY);
    expect(await emailHistory(doc.id)).toBeNull();

    resend();
    for (let i = 0; i < MAX_EMAILS_PER_DOCUMENT; i++) await emailDocument(sachin, doc.id);
    expect((await rejects(emailDocument(sachin, doc.id))).message).toMatch(new RegExp(`already been emailed ${MAX_EMAILS_PER_DOCUMENT} times`));
  });

  it("needs the permission to share a bill, and a customer's bill stays with its own seller", async () => {
    const { doc } = await issuedBill();
    resend();
    const accountant = await makeUser("accountant");
    expect((await rejects(emailDocument(accountant, doc.id))).code).toBe("FORBIDDEN");
    const otherSeller = await makeUser("sales");
    expect((await rejects(emailDocument(otherSeller, doc.id))).code).toBe("FORBIDDEN");
  });
});
