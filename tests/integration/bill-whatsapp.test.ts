import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { auditLogs, customers } from "@/server/db/schema";
import { getSettings } from "@/server/settings";
import { addLine, createSale, finalizeSale } from "@/server/services/sales";
import { recordVerifiedPayment } from "@/server/services/payments";
import { issueBill, issueQuotation, recordPrint, saveSaleCustomer } from "@/server/services/documents";
import { readImportFile } from "@/lib/import-files";
import { MAX_WHATSAPP_PER_DOCUMENT, whatsappDocument, whatsappInfoFor } from "@/server/services/document-whatsapp";
import { getDocument } from "@/server/services/documents";
import { createCustomer } from "@/server/services/customers";
import type { Actor } from "@/server/auth/actor";
import { makeItem, makeUser, rejects, setRegistration, uid } from "./helpers";

let outbox = "";
let registrationBefore: Awaited<ReturnType<typeof getSettings<"tax">>>["registrationType"];

beforeAll(async () => {
  outbox = await mkdtemp(path.join(tmpdir(), "wa-outbox-"));
  process.env.WHATSAPP_OUTBOX_DIR = outbox;
  process.env.WHATSAPP_TEMPLATE = "bill_pdf";
  registrationBefore = (await getSettings("tax")).registrationType;
  await setRegistration("composition");
});
afterAll(async () => {
  delete process.env.WHATSAPP_OUTBOX_DIR;
  delete process.env.WHATSAPP_TEMPLATE;
  await setRegistration(registrationBefore);
});

async function paidBill(seller: Actor, admin: Actor, customer: { name: string; mobile: string; whatsapp?: string | null }) {
  const item = await makeItem(admin, { price: "450", gst: "18" });
  const sale = await createSale(seller);
  await addLine(seller, sale.id, { variantId: item.variantId, quantity: "2" });
  await saveSaleCustomer(seller, sale.id, customer);
  const s = await finalizeSale(seller, sale.id);
  await recordVerifiedPayment(seller, sale.id, { method: "cash", amount: s.grandTotal, verificationMethod: "cash_counted", confirmReceived: true });
  return issueBill(seller, sale.id);
}

/** A mobile number no other test uses. */
const randomMobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

const pdfText = async (file: string) => (await readImportFile("bill.pdf", new Uint8Array(await readFile(file)))).tables[0].rows.flat().join(" ");

const sent = async () => {
  const folders = await readdir(outbox);
  return Promise.all(folders.map(async (f) => JSON.parse(await readFile(path.join(outbox, f, "message.json"), "utf8"))));
};

describe("the customer's WhatsApp number", () => {
  it("is the mobile unless another is given, and a number equal to the mobile is not kept twice", async () => {
    const owner = await makeUser("super_admin");
    const a = await createCustomer(owner, { name: `Same ${uid()}`, mobile: "9876500001", whatsapp: "+91 98765 00001" });
    expect(a.whatsapp).toBeNull();
    const b = await createCustomer(owner, { name: `Other ${uid()}`, mobile: "9876500002", whatsapp: "98250 11111" });
    expect(b.whatsapp).toBe("9825011111");
    expect((await rejects(createCustomer(owner, { name: "Bad", mobile: "9876500003", whatsapp: "12345" }))).message).toMatch(/WhatsApp number/);
  });
});

describe("sending a bill on WhatsApp from the shop's number", () => {
  it("sends the PDF to the WhatsApp number on the bill, with the template's three values", async () => {
    const owner = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const doc = await paidBill(sachin, owner, { name: "Ramesh Patel", mobile: "9876543210", whatsapp: "9825012345" });
    const view = await getDocument(sachin, doc.id);
    expect(view.snapshot.buyer?.whatsapp).toBe("9825012345");
    expect(await whatsappInfoFor(view)).toMatchObject({ ready: true, to: "9825012345", last: null });

    const res = await whatsappDocument(sachin, doc.id);
    expect(res.to).toBe("9825012345");
    const msg = (await sent()).find((m) => m.filename === `${doc.docNumber.replace(/\//g, "-")}.pdf`);
    expect(msg).toMatchObject({ to: "919825012345", template: "bill_pdf" });
    expect(msg.bodyValues).toEqual(["Ramesh Patel", `Bill of Supply ${doc.docNumber}`, "₹900.00"]);
    const folder = (await readdir(outbox)).find((f) => f === msg.id)!;
    expect((await readFile(path.join(outbox, folder, msg.file))).subarray(0, 4).toString()).toBe("%PDF");

    const logs = await getDb()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, doc.id), eq(auditLogs.action, "document.whatsapp")));
    expect(logs).toHaveLength(1);
    expect(logs[0].summary).toMatch(/98xxxxxx45/);
    expect((await whatsappInfoFor(await getDocument(sachin, doc.id)))?.last).toMatchObject({ to: "9825012345", count: 1 });
  });

  it("uses the mobile when no other WhatsApp number was given, and can keep a number typed at the counter", async () => {
    const owner = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const name = `Mahesh ${uid()}`;
    const mobile = randomMobile();
    const doc = await paidBill(sachin, owner, { name, mobile });
    expect((await getDocument(sachin, doc.id)).snapshot.buyer?.whatsapp).toBe(mobile);

    expect((await rejects(whatsappDocument(sachin, doc.id, { to: "123" }))).message).toMatch(/not a valid/);
    await whatsappDocument(sachin, doc.id, { to: "98765 11122", saveToCustomer: true });
    const [c] = await getDb().select().from(customers).where(eq(customers.name, name));
    expect(c.whatsapp).toBe("9876511122");
  });

  it("labels the customer's PDF 'Original for recipient' even after the counter printed it; a quotation has no label", async () => {
    const owner = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const doc = await paidBill(sachin, owner, { name: `Label ${uid()}`, mobile: randomMobile() });
    await recordPrint(owner, doc.id, "pdf");
    await whatsappDocument(sachin, doc.id);
    await whatsappDocument(sachin, doc.id);
    const file = `${doc.docNumber.replace(/\//g, "-")}.pdf`;
    const pdfs = (await sent()).filter((m) => m.filename === file);
    expect(pdfs).toHaveLength(2);
    for (const m of pdfs) {
      const text = await pdfText(path.join(outbox, m.id, m.file));
      expect(text).toContain("Original for recipient");
      expect(text).not.toMatch(/Reprint|Copy/);
    }

    const item = await makeItem(owner, { price: "450", gst: "18" });
    const draft = await createSale(sachin);
    await addLine(sachin, draft.id, { variantId: item.variantId, quantity: "1" });
    const quote = await issueQuotation(sachin, draft.id);
    await whatsappDocument(sachin, quote.id, { to: randomMobile() });
    const q = (await sent()).find((m) => m.filename === `${quote.docNumber.replace(/\//g, "-")}.pdf`);
    expect(await pdfText(path.join(outbox, q.id, q.file))).not.toMatch(/Original for recipient|Reprint|Copy/);
  });

  it("allows five sends of one bill, and none of a practice bill or when WhatsApp is not set up", async () => {
    const owner = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const doc = await paidBill(sachin, owner, { name: `Limit ${uid()}`, mobile: randomMobile() });
    for (let i = 0; i < MAX_WHATSAPP_PER_DOCUMENT; i++) await whatsappDocument(sachin, doc.id);
    expect((await rejects(whatsappDocument(sachin, doc.id))).message).toMatch(/already been sent on WhatsApp 5 times/);

    const saved = process.env.WHATSAPP_OUTBOX_DIR;
    delete process.env.WHATSAPP_OUTBOX_DIR;
    try {
      expect((await rejects(whatsappDocument(sachin, doc.id))).message).toMatch(/not set up/);
      expect((await whatsappInfoFor(await getDocument(sachin, doc.id)))?.ready).toBe(false);
    } finally {
      process.env.WHATSAPP_OUTBOX_DIR = saved;
    }
  });
});
