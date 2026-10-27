import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { auditLogs, documents, sales } from "@/server/db/schema";
import { getSettings } from "@/server/settings";
import { addLine, createSale, deleteSale, finalizeSale, getSale, listSales } from "@/server/services/sales";
import { recordVerifiedPayment } from "@/server/services/payments";
import { cancelBill, deleteQuotation, getDocument, issueBill, issueQuotation, listDocuments, saveSaleCustomer, setShareLink, getDocumentByShareToken } from "@/server/services/documents";
import { deletePhrase } from "@/lib/delete-phrase";
import type { Actor } from "@/server/auth/actor";
import { dbErrorMessage, makeItem, makeUser, rejects, setRegistration } from "./helpers";

let owner: Actor;
let registrationBefore: Awaited<ReturnType<typeof getSettings<"tax">>>["registrationType"];

beforeAll(async () => {
  registrationBefore = (await getSettings("tax")).registrationType;
  await setRegistration("composition");
  owner = await makeUser("super_admin");
});
afterAll(async () => {
  await setRegistration(registrationBefore);
});

const confirm = () => deletePhrase(owner.username);

async function draftWithItem() {
  const item = await makeItem(owner, { price: "450", gst: "18" });
  const sale = await createSale(owner);
  await addLine(owner, sale.id, { variantId: item.variantId, quantity: "2" });
  return sale;
}

async function paidBill() {
  const sale = await draftWithItem();
  await saveSaleCustomer(owner, sale.id, { name: "Delete Test", mobile: "9812345670" });
  const s = await finalizeSale(owner, sale.id);
  await recordVerifiedPayment(owner, sale.id, { method: "cash", amount: s.grandTotal, verificationMethod: "cash_counted", confirmReceived: true });
  const bill = await issueBill(owner, sale.id);
  return { sale, bill };
}

describe("deleting a sale", () => {
  it("is only for the Super Admin, and only with the exact phrase", async () => {
    const sale = await draftWithItem();
    const admin = await makeUser("admin");
    expect((await rejects(deleteSale(admin, sale.id, { confirm: deletePhrase(admin.username) }))).message).toMatch(/Only the Super Admin/);
    expect((await rejects(deleteSale(owner, sale.id, { confirm: "delete" }))).message).toMatch(/Deleting-This/);
    expect((await rejects(deleteSale(owner, sale.id, { confirm: confirm().toLowerCase() }))).message).toMatch(/exactly/);
    expect(deletePhrase("Kishan")).toBe("Kishan-Deleting-This");
  });

  it("hides a draft and its quotation everywhere and closes its share link", async () => {
    const sale = await draftWithItem();
    const quote = await issueQuotation(owner, sale.id);
    const token = await setShareLink(owner, quote.id, true);
    expect(await getDocumentByShareToken(String(token))).not.toBeNull();
    await deleteSale(owner, sale.id, { confirm: confirm(), reason: "Test entry" });

    expect((await rejects(getSale(owner, sale.id))).message).toMatch(/not found/i);
    expect((await rejects(getDocument(owner, quote.id))).message).toMatch(/not found/i);
    expect((await listSales(owner, { includeTraining: true, pageSize: 200 })).items.some((s) => s.id === sale.id)).toBe(false);
    expect((await listDocuments(owner, { includeTraining: true, pageSize: 200 })).items.some((d) => d.id === quote.id)).toBe(false);
    expect(await getDocumentByShareToken(String(token))).toBeNull();

    const [q] = await getDb().select().from(documents).where(eq(documents.id, quote.id));
    expect(q).toMatchObject({ status: "cancelled", deleteReason: "Test entry" });
    expect((await rejects(deleteSale(owner, sale.id, { confirm: confirm() }))).message).toMatch(/already deleted/);
  });

  it("refuses a paid sale; once its bill is cancelled and the money refunded, it can go and stays locked", async () => {
    const { sale, bill } = await paidBill();
    expect((await rejects(deleteSale(owner, sale.id, { confirm: confirm() }))).message).toMatch(/has been received for this sale, so it can't be deleted/);
    expect((await getSale(owner, sale.id)).sale.id).toBe(sale.id);

    await cancelBill(owner, bill.id, { reason: "Goods returned", refund: { method: "cash" } });
    const res = await deleteSale(owner, sale.id, { confirm: confirm() });
    expect(res.cancelledDocuments).toEqual([]);
    const [d] = await getDb().select().from(documents).where(eq(documents.id, bill.id));
    expect(d).toMatchObject({ status: "cancelled", cancelReason: "Goods returned" });

    // The database refuses any later change to the sale or its lines, and still refuses deletes.
    expect(await dbErrorMessage(getDb().update(sales).set({ notes: "edited" }).where(eq(sales.id, sale.id)))).toMatch(/deleted/);
    expect(await dbErrorMessage(getDb().delete(sales).where(eq(sales.id, sale.id)))).toMatch(/not permitted/);

    const logs = await getDb().select().from(auditLogs).where(and(eq(auditLogs.entityId, sale.id), eq(auditLogs.action, "sale.deleted")));
    expect(logs).toHaveLength(1);
    expect(logs[0].summary).toMatch(new RegExp(`^Deleted ${sale.saleNumber} `));
  });
});

describe("deleting a quotation", () => {
  it("deletes a quotation on its own but never a bill", async () => {
    const sale = await draftWithItem();
    const quote = await issueQuotation(owner, sale.id);
    await deleteQuotation(owner, quote.id, { confirm: confirm() });
    expect((await rejects(getDocument(owner, quote.id))).message).toMatch(/not found/i);
    expect((await getSale(owner, sale.id)).sale.id).toBe(sale.id);

    const { bill } = await paidBill();
    expect((await rejects(deleteQuotation(owner, bill.id, { confirm: confirm() }))).message).toMatch(/Only a quotation/);
  });
});
