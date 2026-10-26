/**
 * What a printed bill shows beyond the stored figures (see server/pdf/bill-sheet.ts): the state as
 * "24-Gujarat", how a payment is named, a variant's Colour and Material, and (when the bill is
 * issued) what the customer saved.
 */
import { DOC_TYPE_LABEL, type DocLine, type DocSnapshot } from "@/lib/document-types";
import { D, m, type Dec } from "@/lib/money";

/** "Bill of Supply" from "BILL OF SUPPLY", "Invoice-cum-Bill of Supply" from "INVOICE-CUM-BILL OF SUPPLY". */
export const documentTitle = (s: Pick<DocSnapshot, "title" | "docType">) =>
  s.title.toLowerCase().replace(/[a-z]+/g, (w, at: number) => (at > 0 && (w === "of" || w === "cum") ? w : w.charAt(0).toUpperCase() + w.slice(1))) || DOC_TYPE_LABEL[s.docType];

/** "24-Gujarat", as GST forms write a state. */
export const stateLabel = (code: string | null | undefined, name: string | null | undefined) => [code, name].filter(Boolean).join("-");

export const PAYMENT_METHOD_LABEL: Record<string, string> = { upi: "UPI", cash: "Cash", card: "Card", bank_transfer: "Bank transfer", cheque: "Cheque", other: "Other" };

/**
 * The label on the customer's copy, however it reaches them (email, WhatsApp, the share link): the
 * same every time, even after the counter has printed the bill. A quotation carries none.
 */
export const customerCopyLabel = (docType: string) => (docType === "quotation" ? null : "Original for recipient");

/** Colour and Material from a variant's attributes, whatever the shop called them ("Color", "Shade"). */
export function colourAndMaterial(attributes: Record<string, string> | null | undefined): { colour: string | null; material: string | null } {
  let colour: string | null = null;
  let material: string | null = null;
  for (const [k, v] of Object.entries(attributes ?? {})) {
    const value = v?.trim();
    if (!value) continue;
    if (!colour && /^(colou?r|shade)$/i.test(k.trim())) colour = value;
    if (!material && /^material$/i.test(k.trim())) material = value;
  }
  return { colour, material };
}

/**
 * What the customer saved, in the money they pay: on each item the larger of MRP less what they
 * paid, and the discount given (a discount on a price before GST is counted with its GST). Charges
 * such as delivery are not counted.
 */
export function youSavedOf(lines: DocLine[]): string {
  let saved: Dec = D(0);
  for (const l of lines) {
    if (l.kind !== "item") continue;
    const discount = l.priceIncludesTax ? D(l.discount) : D(l.discount).times(D(1).plus(D(l.gstRate).div(100)));
    const belowMrp = l.mrp ? D(l.mrp).times(D(l.quantity)).minus(D(l.total)) : D(0);
    const best = belowMrp.greaterThan(discount) ? belowMrp : discount;
    if (best.greaterThan(0)) saved = saved.plus(best);
  }
  return m(saved);
}
