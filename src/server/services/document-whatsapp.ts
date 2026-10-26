import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { auditLogs, customers, sales } from "@/server/db/schema";
import { audit } from "@/server/audit";
import { auditActorOf, requirePermission, type Actor } from "@/server/auth/actor";
import { AppError, conflict, invalid, precondition } from "@/server/errors";
import { sendWhatsAppDocument, whatsappConfigured } from "@/server/whatsapp";
import { renderDocumentPdf } from "@/server/pdf/document-pdf";
import { getDocument } from "@/server/services/documents";
import { updateCustomer } from "@/server/services/customers";
import { documentLabel } from "@/server/email/bill-email";
import { formatINR } from "@/lib/money";
import { normalizeMobile } from "@/lib/india";
import type { DocSnapshot, DocumentWhatsAppInfo } from "@/lib/document-types";

/** A bill can be sent on WhatsApp this many times; more is a mistake, not a customer who lost it. */
export const MAX_WHATSAPP_PER_DOCUMENT = 5;

/** The number a bill goes to on WhatsApp: the one on the bill, else the mobile (older bills). */
export const whatsappOf = (s: DocSnapshot) => s.buyer?.whatsapp ?? s.buyer?.mobile ?? null;

/** When and to whom a document was last sent on WhatsApp, and how many times (from the audit trail). */
export async function whatsappHistory(documentId: string): Promise<{ to: string; at: Date; count: number } | null> {
  const rows = await getDb()
    .select({ at: auditLogs.at, data: auditLogs.data })
    .from(auditLogs)
    .where(and(eq(auditLogs.entityType, "document"), eq(auditLogs.entityId, documentId), eq(auditLogs.action, "document.whatsapp")))
    .orderBy(desc(auditLogs.at));
  if (!rows.length) return null;
  return { to: String((rows[0].data as { to?: string } | null)?.to ?? ""), at: rows[0].at, count: rows.length };
}

/** What the bill page shows for WhatsApp: the number on the bill, whether the shop's number is connected, and when it last went. */
export async function whatsappInfoFor(doc: { id: string; status: string; isTraining: boolean; snapshot: DocSnapshot }): Promise<DocumentWhatsAppInfo | undefined> {
  if (doc.status !== "issued") return undefined;
  const last = await whatsappHistory(doc.id);
  return {
    ready: whatsappConfigured(),
    to: whatsappOf(doc.snapshot),
    blocked: doc.isTraining ? "Practice (training) bills are not sent." : undefined,
    last: last ? { to: last.to, at: last.at.toISOString(), count: last.count } : null,
  };
}

/**
 * Sends an issued bill (or quotation) to the customer on WhatsApp from the shop's number, with the
 * PDF attached. The number is the one on the bill unless another is typed; with `saveToCustomer` a
 * number typed here is kept as the customer's WhatsApp. Practice bills and cancelled documents are
 * never sent.
 */
export async function whatsappDocument(actor: Actor, documentId: string, input: { to?: string | null; saveToCustomer?: boolean } = {}) {
  requirePermission(actor, "documents.share");
  if (!whatsappConfigured()) throw precondition("WhatsApp sending from the shop's number is not set up yet (see the README, 'Sending bills on WhatsApp').");
  const doc = await getDocument(actor, documentId);
  const s = doc.snapshot;
  if (doc.status !== "issued") throw conflict("A cancelled document can't be sent.");
  if (doc.isTraining) throw conflict("Practice (training) bills are not sent.");

  const typed = input.to?.trim() || null;
  const to = normalizeMobile(typed ?? whatsappOf(s));
  if (!to) throw invalid(typed ? "That WhatsApp number is not a valid 10-digit Indian number." : "This bill has no WhatsApp number. Enter one to send it.");

  const before = await whatsappHistory(doc.id);
  if ((before?.count ?? 0) >= MAX_WHATSAPP_PER_DOCUMENT)
    throw conflict(`This bill has already been sent on WhatsApp ${MAX_WHATSAPP_PER_DOCUMENT} times. Download the PDF and send it yourself if it is needed again.`);

  const pdf = await renderDocumentPdf(s, { status: doc.status, copyLabel: doc.printCount > 0 || before ? "Copy" : "Original for Recipient" });
  const db = getDb();
  let sent: { id: string | null };
  try {
    sent = await sendWhatsAppDocument({
      to: `91${to}`,
      pdf,
      filename: `${doc.docNumber.replace(/\//g, "-")}.pdf`,
      bodyValues: [s.buyer?.name?.trim() || "Customer", `${documentLabel(s)} ${s.number}`, formatINR(s.totals.grandTotal)],
    });
  } catch (err) {
    await db.transaction((tx) =>
      audit(tx, auditActorOf(actor), {
        action: "document.whatsapp_failed",
        entityType: "document",
        entityId: doc.id,
        summary: `Sending ${doc.docNumber} on WhatsApp to ${masked(to)} failed`,
        data: { to, reason: err instanceof AppError ? err.message : "unknown" },
      }),
    );
    throw err;
  }

  await db.transaction((tx) =>
    audit(tx, auditActorOf(actor), {
      action: "document.whatsapp",
      entityType: "document",
      entityId: doc.id,
      summary: `Sent ${doc.docNumber} on WhatsApp to ${masked(to)}`,
      data: { to, providerId: sent.id },
    }),
  );

  // A number typed at the counter is kept as the customer's WhatsApp for next time.
  if (input.saveToCustomer && typed) {
    const [sale] = await db.select({ customerId: sales.customerId }).from(sales).where(eq(sales.id, doc.saleId));
    const [c] = sale?.customerId ? await db.select().from(customers).where(eq(customers.id, sale.customerId)) : [];
    if (c && (c.whatsapp ?? c.mobile) !== to) await updateCustomer(actor, c.id, { ...c, whatsapp: to });
  }
  return { to, at: new Date(), id: sent.id, sentBefore: before?.count ?? 0 };
}

/** "98xxxxxx10": enough to recognise the number in a log line. */
const masked = (n: string) => `${n.slice(0, 2)}xxxxxx${n.slice(-2)}`;
