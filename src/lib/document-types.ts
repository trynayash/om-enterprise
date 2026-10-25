/**
 * The frozen content of an issued document. Rendering (screen, print, PDF) uses ONLY this
 * snapshot, so a reprint years later is identical to the original even if prices, settings,
 * customer records or the business address change.
 */
export type DocType = "quotation" | "tax_invoice" | "bill_of_supply" | "cash_memo" | "credit_note";

export interface DocParty {
  name: string;
  businessName: string | null;
  address: string | null;
  city: string | null;
  stateCode: string | null;
  stateName: string | null;
  pincode: string | null;
  mobile: string | null;
  email: string | null;
  gstin: string | null;
}

export interface DocLine {
  sl: number;
  kind: "item" | "charge";
  description: string;
  sku: string | null;
  hsn: string | null;
  quantity: string;
  unit: string;
  unitPrice: string;
  priceIncludesTax: boolean;
  discount: string;
  taxableValue: string;
  gstRate: string;
  cgstRate: string;
  cgstAmount: string;
  sgstRate: string;
  sgstAmount: string;
  igstRate: string;
  igstAmount: string;
  cessAmount: string;
  total: string;
  isSample: boolean;
}

export interface DocSnapshot {
  version: 1;
  docType: DocType;
  title: string;
  subtitle: string | null;
  /** Printed at the very top (e.g. composition declaration, Rule 5(1)(f)). */
  declarationTop: string | null;
  isTraining: boolean;
  watermark: string | null;
  number: string;
  issuedAt: string;
  financialYear: string;
  saleNumber: string;
  validUntil: string | null;
  original: { number: string; issuedAt: string; docType: DocType } | null;
  reason: string | null;
  seller: {
    name: string;
    tagline: string;
    addressLines: string[];
    stateCode: string;
    stateName: string;
    phone: string;
    email: string;
    gstin: string | null;
    pan: string | null;
    registrationType: "regular" | "composition" | "unregistered" | null;
  };
  buyer: DocParty | null;
  placeOfSupply: { stateCode: string; stateName: string };
  supplyType: "intra" | "inter" | "none";
  reverseCharge: boolean;
  /** Show GST columns (regular registration only). */
  showTax: boolean;
  lines: DocLine[];
  taxSummary: {
    hsn: string | null;
    gstRate: string;
    taxableValue: string;
    cgst: string;
    sgst: string;
    igst: string;
    cess: string;
    totalTax: string;
  }[];
  totals: {
    gross: string;
    lineDiscount: string;
    cartDiscount: string;
    taxable: string;
    cgst: string;
    sgst: string;
    igst: string;
    cess: string;
    taxTotal: string;
    charges: string;
    roundOff: string;
    grandTotal: string;
    amountInWords: string;
  };
  payments: { method: string; reference: string | null; amount: string; at: string; verification: string | null; direction: "in" | "refund" }[];
  paymentStatus: string;
  amountPaid: string;
  balanceDue: string;
  terms: string[];
  signatoryLabel: string;
  footerNote: string;
  bankDetails: string;
  notes: string | null;
  issuedBy: string;
}

/** What a page needs to know about emailing a document (worked out on the server). */
export interface DocumentEmailInfo {
  /** The shop's email service is connected. */
  ready: boolean;
  /** The customer's email on the bill, if any. */
  buyerEmail: string | null;
  /** Why this document can't be emailed (a practice bill), if so. */
  blocked?: string;
  /** The last time it was emailed (ISO time), and how many times in all. */
  last: { to: string; at: string; count: number } | null;
}

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  quotation: "Quotation",
  tax_invoice: "Tax Invoice",
  bill_of_supply: "Bill of Supply",
  cash_memo: "Cash Memo",
  credit_note: "Credit Note",
};

export const TRAINING_WATERMARK = "TRAINING / SAMPLE DATA — NOT A VALID BILL";
export const COMPOSITION_DECLARATION = "Composition taxable person, not eligible to collect tax on supplies";
