import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { auditLogs, customers, sales } from "@/server/db/schema";
import { audit } from "@/server/audit";
import { auditActorOf, requirePermission, type Actor } from "@/server/auth/actor";
import { AppError, conflict, invalid, precondition } from "@/server/errors";
import { emailConfigured, sendMail } from "@/server/email";
import { billEmail, maskEmail } from "@/server/email/bill-email";
import { renderDocumentPdf } from "@/server/pdf/document-pdf";
import { getDocument } from "@/server/services/documents";
import { updateCustomer } from "@/server/services/customers";
import { isValidEmail } from "@/lib/india";
import { customerCopyLabel } from "@/lib/bill-layout";
import type { DocumentEmailInfo, DocSnapshot } from "@/lib/document-types";

/** A bill can be emailed this many times; more than that is a mistake or misuse, not a customer who lost it. */
export const MAX_EMAILS_PER_DOCUMENT = 5;

/** When and to whom a document was last emailed, and how many times (from the audit trail). */
export async function emailHistory(documentId: string): Promise<{ to: string; at: Date; count: number } | null> {
  const rows = await getDb()
    .select({ at: auditLogs.at, data: auditLogs.data })
    .from(auditLogs)
    .where(and(eq(auditLogs.entityType, "document"), eq(auditLogs.entityId, documentId), eq(auditLogs.action, "document.email")))
    .orderBy(desc(auditLogs.at));
  if (!rows.length) return null;
  return { to: String((rows[0].data as { to?: string } | null)?.to ?? ""), at: rows[0].at, count: rows.length };
}

/** What the bill page shows for emailing: the address on the bill, whether the shop can send, and when it last went. */
export async function emailInfoFor(doc: { id: string; status: string; isTraining: boolean; snapshot: DocSnapshot }): Promise<DocumentEmailInfo | undefined> {
  if (doc.status !== "issued") return undefined;
  const last = await emailHistory(doc.id);
  return {
    ready: emailConfigured(),
    buyerEmail: doc.snapshot.buyer?.email ?? null,
    blocked: doc.isTraining ? "Practice (training) bills are not emailed." : undefined,
    last: last ? { to: last.to, at: last.at.toISOString(), count: last.count } : null,
  };
}

/**
 * Emails an issued bill (or quotation) to the customer as a PDF. The address is the one on the bill
 * unless another is typed; with `saveToCustomer` an address typed here is kept on the customer who has
 * none. Practice (training) bills and cancelled documents are never sent.
 */
export async function emailDocument(actor: Actor, documentId: string, input: { to?: string | null; saveToCustomer?: boolean } = {}) {
  requirePermission(actor, "documents.share");
  if (!emailConfigured()) throw precondition("Email is not set up for this shop yet. The owner needs to connect the email service (see the README, 'Sending bills by email').");
  const doc = await getDocument(actor, documentId);
  const s = doc.snapshot;
  if (doc.status !== "issued") throw conflict("A cancelled document can't be emailed.");
  if (doc.isTraining) throw conflict("Practice (training) bills are not emailed.");

  const to = (input.to ?? s.buyer?.email ?? "").trim();
  if (!to) throw invalid("This bill has no email address. Enter one to send it.");
  if (!isValidEmail(to)) throw invalid("That email address does not look right.");

  const before = await emailHistory(doc.id);
  if ((before?.count ?? 0) >= MAX_EMAILS_PER_DOCUMENT)
    throw conflict(`This bill has already been emailed ${MAX_EMAILS_PER_DOCUMENT} times. Download the PDF and send it yourself if it is needed again.`);

  const base = process.env.APP_BASE_URL?.replace(/\/$/, "");
  const viewUrl = doc.shareToken && base ? `${base}/d/${doc.shareToken}` : null;
  const pdf = await renderDocumentPdf(s, { status: doc.status, cancelReason: doc.cancelReason, copyLabel: customerCopyLabel(doc.docType) });
  const mail = billEmail(s, { viewUrl, logoUrl: base ? `${base}/brand/om-enterprise-logo-email.png` : null });

  const db = getDb();
  let sent: { id: string | null };
  try {
    sent = await sendMail({
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      replyTo: s.seller.email && isValidEmail(s.seller.email) ? s.seller.email : null,
      attachments: [{ filename: `${doc.docNumber.replace(/\//g, "-")}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
  } catch (err) {
    await db.transaction((tx) =>
      audit(tx, auditActorOf(actor), {
        action: "document.email_failed",
        entityType: "document",
        entityId: doc.id,
        summary: `Emailing ${doc.docNumber} to ${maskEmail(to)} failed`,
        data: { to, reason: err instanceof AppError ? err.message : "unknown" },
      }),
    );
    throw err;
  }

  await db.transaction(async (tx) => {
    await audit(tx, auditActorOf(actor), {
      action: "document.email",
      entityType: "document",
      entityId: doc.id,
      summary: `Emailed ${doc.docNumber} to ${maskEmail(to)}`,
      data: { to, providerId: sent.id },
    });
  });

  // An address typed at the counter is kept for next time, only where the customer has none.
  if (input.saveToCustomer && input.to) {
    const [sale] = await db.select({ customerId: sales.customerId }).from(sales).where(eq(sales.id, doc.saleId));
    const [c] = sale?.customerId ? await db.select().from(customers).where(eq(customers.id, sale.customerId)) : [];
    if (c && !c.email) await updateCustomer(actor, c.id, { ...c, email: to });
  }
  return { to, at: new Date(), id: sent.id, sentBefore: before?.count ?? 0 };
}
