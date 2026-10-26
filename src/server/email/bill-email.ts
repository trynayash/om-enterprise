import { DOC_TYPE_LABEL, type DocSnapshot } from "@/lib/document-types";
import { formatINR } from "@/lib/money";

/**
 * The email that carries a bill: a short note in plain words, with the bill itself attached as a PDF
 * (and a link to view it online when the shop has share links turned on). Both a text and an HTML
 * version are made; everything that comes from a person or the shop is escaped in the HTML.
 */
export interface BillEmail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** What kind of document it is, as the customer would say it ("Bill of Supply", not "BILL OF SUPPLY"). */
export const documentLabel = (s: Pick<DocSnapshot, "docType">) => DOC_TYPE_LABEL[s.docType];

export function billEmail(s: DocSnapshot, opts: { viewUrl?: string | null; logoUrl?: string | null } = {}): BillEmail {
  const label = documentLabel(s);
  const shop = s.seller.name;
  const total = formatINR(s.totals.grandTotal);
  const name = s.buyer?.name?.trim() || null;
  const greeting = name ? `Hello ${name},` : "Hello,";
  const intro = `Thank you for shopping with ${shop}. Your ${label.toLowerCase()} ${s.number} for ${total} is attached as a PDF.`;
  const paid = s.docType !== "quotation" && s.paymentStatus === "Paid" ? "Payment received in full." : null;
  const due = s.docType !== "quotation" && Number(s.balanceDue) > 0 ? `Balance due: ${formatINR(s.balanceDue)}.` : null;
  const help = `If anything on it looks wrong, reply to this email${s.seller.phone ? ` or call us on ${s.seller.phone}` : ""}.`;
  const address = s.seller.addressLines.filter(Boolean);

  const text = [
    greeting,
    "",
    intro,
    ...(paid ? [paid] : []),
    ...(due ? [due] : []),
    ...(opts.viewUrl ? ["", `View it online: ${opts.viewUrl}`] : []),
    "",
    help,
    "",
    shop,
    ...address,
    ...(s.seller.phone ? [s.seller.phone] : []),
  ].join("\n");

  const p = "margin:0 0 14px";
  const html = [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0d1b30;max-width:540px">`,
    ...(opts.logoUrl ? [`<p style="margin:0 0 18px"><img src="${escapeHtml(opts.logoUrl)}" width="72" height="72" alt="${escapeHtml(shop)}" style="display:block;border:0"></p>`] : []),
    `<p style="${p}">${escapeHtml(greeting)}</p>`,
    `<p style="${p}">Thank you for shopping with <b>${escapeHtml(shop)}</b>. Your ${escapeHtml(label.toLowerCase())} <b>${escapeHtml(s.number)}</b> for <b>${escapeHtml(total)}</b> is attached as a PDF.</p>`,
    ...(paid ? [`<p style="${p}">${escapeHtml(paid)}</p>`] : []),
    ...(due ? [`<p style="${p}"><b>${escapeHtml(due)}</b></p>`] : []),
    ...(opts.viewUrl ? [`<p style="${p}"><a href="${escapeHtml(opts.viewUrl)}" style="color:#0d1b30">View it online</a></p>`] : []),
    `<p style="${p}">${escapeHtml(help)}</p>`,
    `<p style="margin:22px 0 0;color:#5b6474;font-size:13px">${[shop, ...address, ...(s.seller.phone ? [s.seller.phone] : [])].map(escapeHtml).join("<br>")}</p>`,
    `</div>`,
  ].join("");

  return { subject: `${label} ${s.number} from ${shop}`, text, html };
}

/** "r***@example.com": enough to recognise the address, not enough to read it out of a log line. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}
