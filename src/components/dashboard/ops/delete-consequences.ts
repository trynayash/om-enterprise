import { D, formatINR } from "@/lib/money";

const BILL_TYPES = ["tax_invoice", "bill_of_supply", "cash_memo"];

/** What else deleting a sale does, in plain lines for the confirmation dialog. */
export function deleteConsequences(docs: { docType: string; docNumber: string; status: string }[], received: string): string[] {
  const out: string[] = [];
  const bills = docs.filter((d) => BILL_TYPES.includes(d.docType) && d.status === "issued").map((d) => d.docNumber);
  const quotes = docs.filter((d) => d.docType === "quotation" && d.status === "issued").length;
  const notes = docs.filter((d) => d.docType === "credit_note" && d.status === "issued").map((d) => d.docNumber);
  if (bills.length) out.push(`Bill ${bills.join(", ")} is cancelled. Its number stays used, as GST requires, and is not given to another bill.`);
  if (notes.length) out.push(`Credit note ${notes.join(", ")} is cancelled too.`);
  if (quotes) out.push(`${quotes === 1 ? "Its quotation is" : `Its ${quotes} quotations are`} deleted with it.`);
  if (D(received).greaterThan(0)) out.push(`${formatINR(received)} was received for this sale. That money leaves the payment and collection reports with it — refund the customer separately if needed.`);
  return out;
}
