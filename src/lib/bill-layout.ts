/**
 * What a printed bill shows beyond the stored figures, worked out the same way for the PDF and the
 * on-screen bill: the discount as a percentage, the state as "24-Gujarat", which optional columns
 * the bill needs, how a payment is named, and (when the bill is issued) what the customer saved.
 */
import type { DocLine, DocSnapshot } from "@/lib/document-types";
import { D, m, type Dec } from "@/lib/money";

/** "24-Gujarat", as GST forms write a state. */
export const stateLabel = (code: string | null | undefined, name: string | null | undefined) => [code, name].filter(Boolean).join("-");

/** The line's discount as a share of its price before discount: "7.22%", "12%". Null when there is none. */
export function discountPercent(l: Pick<DocLine, "discount" | "unitPrice" | "quantity">): string | null {
  const gross = D(l.unitPrice).times(D(l.quantity));
  if (!Number(l.discount) || gross.isZero()) return null;
  return `${Number(D(l.discount).div(gross).times(100).toFixed(2))}%`;
}

/** Optional columns, shown only when some line on this bill has a value for them. */
export function optionalColumns(lines: DocLine[]) {
  const items = lines.filter((l) => l.kind === "item");
  return { mrp: items.some((l) => !!l.mrp), colour: items.some((l) => !!l.colour), material: items.some((l) => !!l.material) };
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = { upi: "UPI", cash: "Cash", card: "Card", bank_transfer: "Bank transfer", cheque: "Cheque", other: "Other" };

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

/** Received and balance rows belong on a bill; a quotation and a credit note have neither. */
export const showsPaymentTotals = (s: Pick<DocSnapshot, "docType">) => s.docType !== "quotation" && s.docType !== "credit_note";
