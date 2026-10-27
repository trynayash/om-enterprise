import { formatINR } from "@/lib/money";
import { PAYMENT_METHOD_LABEL } from "@/lib/bill-layout";
import type { OwnerDay, Waiting } from "@/server/services/owner";

/**
 * Emails to the shop owner, in plain words: the evening summary of the day, and a note when staff ask
 * for a discount approval. Text and HTML versions; everything from a person is escaped in the HTML.
 */
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" });

const wrap = (body: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0d1b30;max-width:540px">${body}</div>`;
const p = (html: string) => `<p style="margin:0 0 14px">${html}</p>`;
const link = (url: string, label: string) => `<a href="${escapeHtml(url)}" style="color:#0d1b30;font-weight:bold">${escapeHtml(label)}</a>`;

export function dailySummaryEmail(o: { shop: string; day: OwnerDay; waiting: Waiting; appUrl: string | null }) {
  const { day, waiting } = o;
  const when = dayLabel(day.day);
  const rows: [string, string][] = [
    ["Bills", String(day.bills)],
    ["Billed", formatINR(day.billed)],
    ["Money received", formatINR(day.received)],
    ...day.byMethod.map((b): [string, string] => [`   ${PAYMENT_METHOD_LABEL[b.method] ?? b.method}`, formatINR(b.amount)]),
    ...(Number(day.refunded) > 0 ? [["Refunded", formatINR(day.refunded)] as [string, string]] : []),
    ["Discounts given", formatINR(day.discounts)],
    ...(day.cancelledBills ? [["Bills cancelled", String(day.cancelledBills)] as [string, string]] : []),
  ];
  const owed = [
    waiting.discounts ? `${waiting.discounts} discount request${waiting.discounts === 1 ? "" : "s"} to approve` : null,
    waiting.prices ? `${waiting.prices} price change${waiting.prices === 1 ? "" : "s"} to approve` : null,
    waiting.orders ? `${waiting.orders} new website order${waiting.orders === 1 ? "" : "s"}` : null,
    day.unpaid.count ? `${day.unpaid.count} sale${day.unpaid.count === 1 ? "" : "s"} not fully paid (${formatINR(day.unpaid.amount)} due)` : null,
  ].filter((x): x is string => !!x);

  const subject = `${o.shop} today: ${day.bills} bill${day.bills === 1 ? "" : "s"}, ${formatINR(day.received)} received`;
  const text = [
    `${o.shop} — ${when}`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    ...(owed.length ? ["Waiting for you:", ...owed.map((x) => `- ${x}`)] : ["Nothing is waiting for you."]),
    ...(o.appUrl ? ["", `Open the app: ${o.appUrl}`] : []),
  ].join("\n");
  const html = wrap(
    [
      p(`<b>${escapeHtml(o.shop)}</b> — ${escapeHtml(when)}`),
      `<table style="border-collapse:collapse;margin:0 0 16px;min-width:280px">${rows
        .map(([k, v]) => `<tr><td style="padding:4px 18px 4px 0;color:#5b6474">${k.startsWith(" ") ? "&nbsp;&nbsp;&nbsp;" : ""}${escapeHtml(k.trim())}</td><td style="padding:4px 0;text-align:right;font-weight:bold;white-space:nowrap">${escapeHtml(v)}</td></tr>`)
        .join("")}</table>`,
      owed.length ? p(`<b>Waiting for you</b><br>${owed.map(escapeHtml).join("<br>")}`) : p("Nothing is waiting for you."),
      ...(o.appUrl ? [p(link(o.appUrl, "Open the app"))] : []),
    ].join(""),
  );
  return { subject, text, html };
}

export function approvalAlertEmail(o: { shop: string; requestedBy: string; saleNumber: string; grandTotal: string; discountPercent: string | null; reason: string; appUrl: string | null }) {
  const what = `${o.discountPercent ? `${Number(o.discountPercent)}% discount` : "A discount"} on ${o.saleNumber} (${formatINR(o.grandTotal)})`;
  const subject = `Approve? ${what} — asked by ${o.requestedBy}`;
  const text = [`${o.requestedBy} asks you to approve a ${what}.`, `Reason: ${o.reason}`, ...(o.appUrl ? ["", `Approve or reject: ${o.appUrl}`] : []), "", o.shop].join("\n");
  const html = wrap(
    [
      p(`<b>${escapeHtml(o.requestedBy)}</b> asks you to approve a ${escapeHtml(what)}.`),
      p(`Reason: ${escapeHtml(o.reason)}`),
      ...(o.appUrl ? [p(link(o.appUrl, "Approve or reject"))] : []),
      `<p style="margin:22px 0 0;color:#5b6474;font-size:13px">${escapeHtml(o.shop)}</p>`,
    ].join(""),
  );
  return { subject, text, html };
}
