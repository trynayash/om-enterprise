import "server-only";
import { notFound, redirect } from "next/navigation";
import { AppError } from "@/server/errors";

/** Map service NOT_FOUND / FORBIDDEN errors onto the 404 page and the forbidden page. */
export async function loadOr404<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof AppError) {
      if (err.code === "NOT_FOUND") notFound();
      if (err.code === "FORBIDDEN") redirect("/dashboard/forbidden");
    }
    throw err;
  }
}

export const METHOD_LABEL: Record<string, string> = {
  upi: "UPI",
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  other: "Other",
};

export const VERIFICATION_LABEL: Record<string, string> = {
  manual_merchant_app: "Checked in merchant UPI app",
  manual_bank_statement: "Checked bank statement",
  cash_counted: "Cash counted at counter",
  gateway_webhook: "Confirmed by payment gateway",
  gateway_api: "Confirmed via gateway API",
  manual_other: "Manual (other)",
};

export const DOC_LABEL: Record<string, string> = {
  quotation: "Quotation",
  tax_invoice: "Tax invoice",
  bill_of_supply: "Bill of supply",
  cash_memo: "Cash memo",
  credit_note: "Credit note",
};
