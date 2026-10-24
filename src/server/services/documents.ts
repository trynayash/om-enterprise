import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { getDb, type Tx } from "@/server/db/client";
import { lineDescription } from "@/lib/line-description";
import {
  customers,
  documents,
  payments,
  saleLines,
  saleReturnLines,
  saleReturns,
  sales,
  stockLocations,
  stockMovements,
  units,
  users,
} from "@/server/db/schema";
import { audit } from "@/server/audit";
import { auditActorOf, can, requirePermission, type Actor } from "@/server/auth/actor";
import { AppError, conflict, forbidden, invalid, notFound, precondition } from "@/server/errors";
import { getAllSettings } from "@/server/settings";
import { createCustomer, updateCustomer, type CustomerInput } from "@/server/services/customers";
import { creditedTotal, recomputeSalePayments, recordRefund } from "@/server/services/payments";
import { recalculate } from "@/server/services/sales";
import { computeTax } from "@/lib/pricing/engine";
import { amountInWords, D, m, r0, r2 } from "@/lib/money";
import { financialYear, formatDocNumber, stateName } from "@/lib/india";
import {
  COMPOSITION_DECLARATION,
  TRAINING_WATERMARK,
  type DocLine,
  type DocParty,
  type DocSnapshot,
  type DocType,
} from "@/lib/document-types";
import type { Settings } from "@/lib/settings-schema";

type Sale = typeof sales.$inferSelect;
type SaleLine = typeof saleLines.$inferSelect;
type Customer = typeof customers.$inferSelect;

function canSeeSale(actor: Actor, sale: { createdBy: string }) {
  return sale.createdBy === actor.id || can(actor, "sales.view_all");
}

async function lockSale(tx: Tx, saleId: string): Promise<Sale> {
  const [s] = await tx.select().from(sales).where(eq(sales.id, saleId)).for("update");
  if (!s) throw notFound("Sale");
  return s;
}

/* ------------------------------------------------------------------ */
/* Numbering                                                           */
/* ------------------------------------------------------------------ */

/** Gapless, unique per series & financial year. Row lock on the sequence serialises issuers. */
export async function allocateDocNumber(tx: Tx, seriesKey: string, prefix: string, issuedAt: Date) {
  const fy = financialYear(issuedAt);
  const res = await tx.execute<{ seq: number }>(sql`
    INSERT INTO document_sequences (series_key, financial_year, next_seq) VALUES (${seriesKey}, ${fy}, 2)
    ON CONFLICT (series_key, financial_year) DO UPDATE SET next_seq = document_sequences.next_seq + 1
    RETURNING next_seq - 1 AS seq`);
  const seq = Number(res.rows[0].seq);
  return { seq, fy, docNumber: formatDocNumber(prefix, fy, seq) };
}

/* ------------------------------------------------------------------ */
/* Document type rules                                                 */
/* ------------------------------------------------------------------ */

export function billingDocType(
  regType: Settings["tax"]["registrationType"],
  lines: Pick<SaleLine, "lineType" | "gstRate">[],
  buyerGstin: string | null,
): { docType: Exclude<DocType, "quotation" | "credit_note">; title: string; subtitle: string | null } {
  if (regType === "composition") return { docType: "bill_of_supply", title: "BILL OF SUPPLY", subtitle: null };
  if (regType === "unregistered") return { docType: "cash_memo", title: "CASH MEMO", subtitle: "Retail bill — GST not charged" };
  // Unconfirmed registration only ever reaches here for TRAINING sales (real bills are blocked);
  // they are calculated with GST like a regular registrant, so present them that way.
  if (regType === null) return { docType: "tax_invoice", title: "TRAINING BILL", subtitle: "GST registration not yet confirmed — practice document only" };
  const items = lines.filter((l) => l.lineType === "item");
  const taxable = items.filter((l) => D(l.gstRate).greaterThan(0));
  const exempt = items.filter((l) => D(l.gstRate).isZero());
  if (!taxable.length) return { docType: "bill_of_supply", title: "BILL OF SUPPLY", subtitle: "Exempt / nil-rated supply" };
  if (exempt.length) {
    if (buyerGstin) {
      throw invalid("This bill mixes taxable and exempt items for a GST-registered buyer. Bill the exempt items as a separate sale.");
    }
    return { docType: "tax_invoice", title: "INVOICE-CUM-BILL OF SUPPLY", subtitle: "Rule 46A — taxable and exempt supplies" };
  }
  return { docType: "tax_invoice", title: "TAX INVOICE", subtitle: null };
}

function partyFromCustomer(c: Customer | null): DocParty | null {
  if (!c) return null;
  return {
    name: c.name,
    businessName: c.businessName,
    address: c.billingAddress,
    city: c.city,
    stateCode: c.stateCode,
    stateName: stateName(c.stateCode),
    pincode: c.pincode,
    mobile: c.mobile,
    email: c.email,
    gstin: c.gstin,
  };
}

/** Rule 46(d)/(e) recipient-detail checks for tax invoices; place-of-supply consistency. */
export function checkBuyerRequirements(args: {
  regType: Settings["tax"]["registrationType"];
  docType: DocType;
  buyer: DocParty | null;
  taxableTotal: string;
  threshold: string;
  placeOfSupply: string;
}) {
  const { regType, docType, buyer, taxableTotal, threshold, placeOfSupply } = args;
  if (regType !== "regular" || docType !== "tax_invoice") return;
  const needFull = (why: string) => {
    if (!buyer?.name || !buyer.address || !buyer.stateCode) {
      throw new AppError("VALIDATION", `${why}: customer name, address and state are required on the invoice`, { field: "customer" });
    }
  };
  if (buyer?.gstin) needFull("GST-registered buyer");
  else if (D(taxableTotal).greaterThanOrEqualTo(D(threshold))) needFull(`Taxable value of ₹${m(taxableTotal)} is ₹${m(threshold)} or more`);
  if (buyer && !buyer.gstin && buyer.stateCode && buyer.stateCode !== placeOfSupply) {
    throw new AppError(
      "VALIDATION",
      `The customer's address is in ${stateName(buyer.stateCode)} but this sale was priced for supply in ${stateName(placeOfSupply)}. ` +
        "For an unregistered buyer the recorded address decides the place of supply. Enter the delivery address in " +
        `${stateName(placeOfSupply)}, or reopen the sale before payment and change the place of supply.`,
      { field: "stateCode" },
    );
  }
}

function lineSnapshot(l: SaleLine, i: number, unitNames: Map<string, string>): DocLine {
  return {
    sl: i + 1,
    kind: l.lineType,
    description: l.lineType === "charge" ? l.productName : lineDescription(l.brandName, l.productName, l.variantName),
    sku: l.sku,
    hsn: l.hsnCode,
    quantity: D(l.quantity).toString(),
    unit: unitNames.get(l.unitCode) ?? l.unitCode,
    unitPrice: l.unitPrice,
    priceIncludesTax: l.priceIncludesTax,
    discount: m(D(l.lineDiscountAmount).plus(D(l.cartDiscountShare))),
    taxableValue: l.taxableValue,
    gstRate: D(l.gstRate).toString(),
    cgstRate: D(l.gstRate).div(2).toString(),
    cgstAmount: l.cgstAmount,
    sgstRate: D(l.gstRate).div(2).toString(),
    sgstAmount: l.sgstAmount,
    igstRate: D(l.gstRate).toString(),
    igstAmount: l.igstAmount,
    cessAmount: l.cessAmount,
    total: l.lineTotal,
    isSample: l.isSample,
  };
}

function taxSummaryOf(lines: DocLine[]): DocSnapshot["taxSummary"] {
  const map = new Map<string, DocSnapshot["taxSummary"][number]>();
  for (const l of lines) {
    const k = `${l.hsn ?? ""}|${l.gstRate}`;
    const row = map.get(k) ?? { hsn: l.hsn, gstRate: l.gstRate, taxableValue: "0", cgst: "0", sgst: "0", igst: "0", cess: "0", totalTax: "0" };
    row.taxableValue = m(D(row.taxableValue).plus(D(l.taxableValue)));
    row.cgst = m(D(row.cgst).plus(D(l.cgstAmount)));
    row.sgst = m(D(row.sgst).plus(D(l.sgstAmount)));
    row.igst = m(D(row.igst).plus(D(l.igstAmount)));
    row.cess = m(D(row.cess).plus(D(l.cessAmount)));
    row.totalTax = m(D(row.cgst).plus(D(row.sgst)).plus(D(row.igst)).plus(D(row.cess)));
    map.set(k, row);
  }
  return [...map.values()];
}

async function unitNameMap(tx: Tx) {
  const rows = await tx.select({ code: units.code, name: units.name }).from(units);
  return new Map(rows.map((r) => [r.code, r.name]));
}

function sellerOf(s: Settings): DocSnapshot["seller"] {
  const b = s.business;
  return {
    name: b.name,
    tagline: b.tagline,
    addressLines: [b.addressLine1, b.addressLine2, `${b.city}${b.district ? `, Dist. ${b.district}` : ""}, ${stateName(b.stateCode)} ${b.pincode}`].filter(Boolean),
    stateCode: b.stateCode,
    stateName: stateName(b.stateCode) ?? "",
    phone: b.phone,
    email: b.email,
    gstin: s.tax.registrationType === "unregistered" ? null : b.gstin || null,
    pan: b.pan || null,
    registrationType: s.tax.registrationType,
  };
}

async function paymentsSnapshot(tx: Tx, saleId: string) {
  const rows = await tx
    .select()
    .from(payments)
    .where(and(eq(payments.saleId, saleId), eq(payments.status, "successful")))
    .orderBy(asc(payments.verifiedAt));
  return rows.map((p) => ({
    method: p.method,
    reference: p.reference,
    amount: p.amount,
    at: (p.verifiedAt ?? p.createdAt).toISOString(),
    verification: p.verificationMethod,
    direction: p.direction,
  }));
}

/** Create or update the customer from the billing form and attach it to the sale. */
async function resolveCustomer(
  tx: Tx,
  actor: Actor,
  sale: Sale,
  input: (CustomerInput & { id?: string | null }) | null | undefined,
): Promise<Customer | null> {
  if (input === undefined) {
    if (!sale.customerId) return null;
    const [c] = await tx.select().from(customers).where(eq(customers.id, sale.customerId));
    return c ?? null;
  }
  if (input === null) {
    await tx.update(sales).set({ customerId: null }).where(eq(sales.id, sale.id));
    return null;
  }
  const c = input.id ? await updateCustomer(actor, input.id, input, tx) : await createCustomer(actor, input, tx);
  await tx.update(sales).set({ customerId: c.id }).where(eq(sales.id, sale.id));
  return c;
}

/* ------------------------------------------------------------------ */
/* Quotation                                                           */
/* ------------------------------------------------------------------ */

export async function issueQuotation(actor: Actor, saleId: string, customer?: (CustomerInput & { id?: string | null }) | null) {
  requirePermission(actor, "sales.create");
  const db = getDb();
  return db.transaction(async (tx) => {
    const sale = await lockSale(tx, saleId);
    if (!canSeeSale(actor, sale)) throw forbidden();
    if (sale.status !== "draft") throw conflict("Quotations are issued from a draft sale");
    const evalRes = await recalculate(tx, actor, saleId);
    if (evalRes.missingPrices.length) throw precondition(`No current price for: ${evalRes.missingPrices.join(", ")}`);
    if (evalRes.approvalNeeded) {
      throw new AppError("APPROVAL_REQUIRED", `Approval needed before quoting: ${evalRes.approvalReasons.join("; ")}`);
    }
    const s = await lockSale(tx, saleId);
    const lines = await tx.select().from(saleLines).where(eq(saleLines.saleId, saleId)).orderBy(asc(saleLines.lineNo));
    if (!lines.some((l) => l.lineType === "item")) throw invalid("Add items before issuing a quotation");
    const buyer = partyFromCustomer(await resolveCustomer(tx, actor, s, customer));
    const settings = await getAllSettings(tx);
    const now = new Date();
    const validUntil = new Date(now.getTime() + settings.documents.quotationValidityDays * 86400_000);
    const seriesKey = s.isTraining ? "training" : "quotation";
    const prefix = s.isTraining ? settings.documents.prefixes.training : settings.documents.prefixes.quotation;
    const { seq, fy, docNumber } = await allocateDocNumber(tx, seriesKey, prefix, now);
    const unitNames = await unitNameMap(tx);
    const docLines = lines.map((l, i) => lineSnapshot(l, i, unitNames));
    const snapshot: DocSnapshot = {
      ...baseSnapshot(settings, s, docLines, buyer, actor, now, fy, docNumber),
      docType: "quotation",
      title: "QUOTATION",
      subtitle: `Valid until ${validUntil.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} — prices held for this period`,
      declarationTop: settings.tax.registrationType === "composition" ? COMPOSITION_DECLARATION : null,
      validUntil: validUntil.toISOString(),
      payments: [],
      paymentStatus: "not applicable",
      amountPaid: "0.00",
      balanceDue: s.grandTotal,
    };
    const [doc] = await tx
      .insert(documents)
      .values({
        saleId,
        docType: "quotation",
        seriesKey,
        financialYear: fy,
        seq,
        docNumber,
        isTraining: s.isTraining,
        issuedAt: now,
        issuedBy: actor.id,
        snapshot,
        taxableTotal: s.taxableTotal,
        taxTotal: snapshot.totals.taxTotal,
        grandTotal: s.grandTotal,
        validUntil,
        shareToken: settings.documents.shareLinksEnabled ? randomBytes(24).toString("base64url") : null,
      })
      .returning();
    // Lock the quoted prices on the draft for the validity period.
    for (const l of lines) {
      if (l.lineType === "item") await tx.update(saleLines).set({ priceSource: "quotation" }).where(eq(saleLines.id, l.id));
    }
    await tx.update(sales).set({ quotationDocumentId: doc.id, quotationValidUntil: validUntil, updatedAt: now }).where(eq(sales.id, saleId));
    await audit(tx, auditActorOf(actor), {
      action: "document.issue",
      entityType: "document",
      entityId: doc.id,
      summary: `Issued quotation ${docNumber} for ${s.saleNumber}: ₹${s.grandTotal}`,
      data: { saleId, docType: "quotation", grandTotal: s.grandTotal, validUntil },
    });
    return doc;
  });
}

function baseSnapshot(
  settings: Settings,
  sale: Sale,
  lines: DocLine[],
  buyer: DocParty | null,
  actor: Actor,
  issuedAt: Date,
  fy: string,
  number: string,
): Omit<DocSnapshot, "docType" | "title" | "subtitle" | "declarationTop" | "validUntil" | "payments" | "paymentStatus" | "amountPaid" | "balanceDue"> {
  const showTax = settings.tax.registrationType === "regular" || (settings.tax.registrationType === null && sale.isTraining);
  const taxTotal = D(sale.cgstTotal).plus(D(sale.sgstTotal)).plus(D(sale.igstTotal)).plus(D(sale.cessTotal));
  return {
    version: 1,
    isTraining: sale.isTraining,
    watermark: sale.isTraining ? TRAINING_WATERMARK : null,
    number,
    issuedAt: issuedAt.toISOString(),
    financialYear: fy,
    saleNumber: sale.saleNumber,
    original: null,
    reason: null,
    seller: sellerOf(settings),
    buyer,
    placeOfSupply: { stateCode: sale.placeOfSupplyStateCode, stateName: stateName(sale.placeOfSupplyStateCode) ?? "" },
    supplyType: sale.taxMode,
    reverseCharge: false,
    showTax,
    lines,
    taxSummary: taxSummaryOf(lines),
    totals: {
      gross: m(D(sale.subtotalGross).plus(D(sale.chargesTotal))),
      lineDiscount: sale.lineDiscountTotal,
      cartDiscount: sale.cartDiscountTotal,
      taxable: sale.taxableTotal,
      cgst: sale.cgstTotal,
      sgst: sale.sgstTotal,
      igst: sale.igstTotal,
      cess: sale.cessTotal,
      taxTotal: m(taxTotal),
      charges: sale.chargesTotal,
      roundOff: sale.roundOff,
      grandTotal: sale.grandTotal,
      amountInWords: amountInWords(sale.grandTotal),
    },
    terms: settings.documents.terms,
    signatoryLabel: settings.documents.signatoryLabel,
    footerNote: settings.documents.footerNote,
    bankDetails: settings.documents.bankDetails,
    notes: sale.notes,
    issuedBy: actor.displayName,
  };
}

/* ------------------------------------------------------------------ */
/* Bill (tax invoice / bill of supply / cash memo)                     */
/* ------------------------------------------------------------------ */

export async function issueBill(
  actor: Actor,
  saleId: string,
  opts: { customer?: (CustomerInput & { id?: string | null }) | null; allowOutstanding?: boolean } = {},
) {
  requirePermission(actor, "documents.issue");
  const db = getDb();
  return db.transaction(async (tx) => {
    const sale = await lockSale(tx, saleId);
    if (!canSeeSale(actor, sale)) throw forbidden();
    if (sale.status === "completed") throw conflict("A bill has already been issued for this sale");
    if (sale.status !== "finalized") throw precondition("Finalise the sale and take payment before issuing the bill");
    const settings = await getAllSettings(tx);
    if (settings.tax.registrationType === null && !sale.isTraining) {
      throw precondition("GST registration type is not configured (Settings → Tax)");
    }

    // Payment check
    const credited = await creditedTotal(tx, saleId);
    const netPaid = D(sale.amountPaid).minus(D(sale.amountRefunded));
    const due = D(sale.grandTotal).minus(credited).minus(netPaid);
    const customer = await resolveCustomer(tx, actor, sale, opts.customer);
    if (due.greaterThan(0)) {
      if (!opts.allowOutstanding) {
        throw new AppError("PRECONDITION", `₹${m(due)} is still unpaid. Verify the payment before issuing the bill.`, { due: m(due) });
      }
      if (!settings.discounts.allowCreditSales || !can(actor, "sales.credit")) {
        throw forbidden("Issuing a bill with an unpaid balance (credit sale) is not permitted for you");
      }
      if (!customer?.name || !customer.mobile) throw invalid("Credit sales need the customer's name and mobile number");
    }

    const lines = await tx.select().from(saleLines).where(eq(saleLines.saleId, saleId)).orderBy(asc(saleLines.lineNo));
    const buyer = partyFromCustomer(customer);
    const { docType, title, subtitle } = billingDocType(settings.tax.registrationType, lines, buyer?.gstin ?? null);
    checkBuyerRequirements({
      regType: settings.tax.registrationType,
      docType,
      buyer,
      taxableTotal: sale.taxableTotal,
      threshold: settings.tax.b2cDetailsThreshold,
      placeOfSupply: sale.placeOfSupplyStateCode,
    });
    if (settings.tax.registrationType === "regular" && docType === "tax_invoice") {
      const minDigits = settings.tax.hsnMinDigits;
      const bad = lines.filter((l) => l.lineType === "item" && (!l.hsnCode || l.hsnCode.length < minDigits));
      if (bad.length && buyer?.gstin) {
        throw invalid(`HSN code (min ${minDigits} digits) missing for: ${bad.map((b) => b.sku).join(", ")}. Update the product before billing a registered buyer.`);
      }
      if (!settings.business.gstin && !sale.isTraining) throw precondition("Enter the shop's GSTIN in Settings → Business before issuing tax invoices");
    }

    const now = new Date();
    const seriesKey = sale.isTraining ? "training" : docType;
    const prefix = sale.isTraining ? settings.documents.prefixes.training : settings.documents.prefixes[docType];
    const { seq, fy, docNumber } = await allocateDocNumber(tx, seriesKey, prefix, now);
    const unitNames = await unitNameMap(tx);
    const docLines = lines.map((l, i) => lineSnapshot(l, i, unitNames));
    const pays = await paymentsSnapshot(tx, saleId);
    const snapshot: DocSnapshot = {
      ...baseSnapshot(settings, sale, docLines, buyer, actor, now, fy, docNumber),
      docType,
      title,
      subtitle,
      declarationTop: settings.tax.registrationType === "composition" ? COMPOSITION_DECLARATION : null,
      validUntil: null,
      payments: pays,
      paymentStatus: due.greaterThan(0) ? (netPaid.greaterThan(0) ? "Partially paid" : "Unpaid (credit)") : "Paid",
      amountPaid: m(netPaid),
      balanceDue: m(due.greaterThan(0) ? due : 0),
    };
    const [doc] = await tx
      .insert(documents)
      .values({
        saleId,
        docType,
        seriesKey,
        financialYear: fy,
        seq,
        docNumber,
        isTraining: sale.isTraining,
        issuedAt: now,
        issuedBy: actor.id,
        snapshot,
        taxableTotal: sale.taxableTotal,
        taxTotal: snapshot.totals.taxTotal,
        grandTotal: sale.grandTotal,
        shareToken: settings.documents.shareLinksEnabled ? randomBytes(24).toString("base64url") : null,
      })
      .returning();
    await tx.update(sales).set({ status: "completed", completedAt: now, updatedAt: now }).where(eq(sales.id, saleId));

    // Inventory integration (off by default; never deducts until explicitly enabled).
    if (settings.inventory.enabled && settings.inventory.deductStockOnSale && !sale.isTraining) {
      const [loc] = await tx.select().from(stockLocations).where(eq(stockLocations.isDefault, true));
      if (loc) {
        for (const l of lines.filter((x) => x.lineType === "item" && x.variantId)) {
          await tx.insert(stockMovements).values({
            variantId: l.variantId!,
            locationId: loc.id,
            quantityChange: D(l.quantity).negated().toString(),
            movementType: "sale",
            referenceType: "document",
            referenceId: doc.id,
            unitCost: l.unitCost,
            createdBy: actor.id,
          });
        }
      }
    }

    await audit(tx, auditActorOf(actor), {
      action: "document.issue",
      entityType: "document",
      entityId: doc.id,
      summary: `Issued ${title.toLowerCase()} ${docNumber} for ${sale.saleNumber}: ₹${sale.grandTotal}${sale.isTraining ? " [TRAINING]" : ""}`,
      data: { saleId, docType, grandTotal: sale.grandTotal, balanceDue: snapshot.balanceDue, customerId: customer?.id ?? null },
    });
    return doc;
  });
}

/* ------------------------------------------------------------------ */
/* Cancellation (bill issued in error, goods not supplied)             */
/* ------------------------------------------------------------------ */

export async function cancelBill(
  actor: Actor,
  documentId: string,
  input: { reason: string; refund?: { method: "cash" | "upi" | "bank_transfer" | "card" | "cheque"; reference?: string | null } | null },
) {
  requirePermission(actor, "documents.cancel");
  if (input.reason.trim().length < 5) throw invalid("Explain why the bill is being cancelled");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [doc] = await tx.select().from(documents).where(eq(documents.id, documentId)).for("update");
    if (!doc) throw notFound("Document");
    if (doc.status === "cancelled") throw conflict("Already cancelled");
    if (doc.docType === "credit_note") throw invalid("Credit notes cannot be cancelled here");
    const sale = await lockSale(tx, doc.saleId);
    if (doc.docType !== "quotation") {
      const returns = await tx.select({ id: saleReturns.id }).from(saleReturns).where(eq(saleReturns.saleId, sale.id));
      if (returns.length) throw conflict("Items have been returned against this bill — use further credit notes instead of cancelling");
      const netPaid = D(sale.amountPaid).minus(D(sale.amountRefunded));
      if (netPaid.greaterThan(0)) {
        if (!input.refund) throw new AppError("PRECONDITION", `₹${m(netPaid)} was received. Record how it is being refunded.`, { netPaid: m(netPaid) });
        await recordRefund(tx, actor, sale.id, { amount: m(netPaid), method: input.refund.method, reference: input.refund.reference, note: `Bill ${doc.docNumber} cancelled` });
      }
    }
    const now = new Date();
    await tx
      .update(documents)
      .set({ status: "cancelled", cancelledAt: now, cancelledBy: actor.id, cancelReason: input.reason.trim() })
      .where(eq(documents.id, documentId));
    if (doc.docType !== "quotation") {
      await tx.update(sales).set({ status: "cancelled", cancelledAt: now, cancelledBy: actor.id, cancelReason: `Bill ${doc.docNumber} cancelled: ${input.reason.trim()}`, updatedAt: now }).where(eq(sales.id, sale.id));
    }
    await audit(tx, auditActorOf(actor), {
      action: "document.cancel",
      entityType: "document",
      entityId: doc.id,
      summary: `Cancelled ${doc.docNumber} (₹${doc.grandTotal}): ${input.reason.trim()}`,
      data: { saleId: sale.id, refund: input.refund ?? null },
    });
  });
}

/* ------------------------------------------------------------------ */
/* Returns → credit note                                               */
/* ------------------------------------------------------------------ */

export async function createReturn(
  actor: Actor,
  saleId: string,
  input: {
    lines: { saleLineId: string; quantity: string }[];
    reason: string;
    refund?: { method: "cash" | "upi" | "bank_transfer" | "card" | "cheque"; reference?: string | null; amount?: string | null } | null;
  },
) {
  requirePermission(actor, "documents.credit_note");
  if (input.reason.trim().length < 3) throw invalid("Give a reason for the return");
  if (!input.lines.length) throw invalid("Select the items being returned");
  const db = getDb();
  return db.transaction(async (tx) => {
    const sale = await lockSale(tx, saleId);
    if (sale.status !== "completed") throw conflict("Returns can only be processed for billed (completed) sales");
    const [invoice] = await tx
      .select()
      .from(documents)
      .where(and(eq(documents.saleId, saleId), eq(documents.status, "issued"), inArray(documents.docType, ["tax_invoice", "bill_of_supply", "cash_memo"])));
    if (!invoice) throw conflict("No issued bill found for this sale");
    const lines = await tx.select().from(saleLines).where(eq(saleLines.saleId, saleId));
    const prior = await tx
      .select({ saleLineId: saleReturnLines.saleLineId, quantity: saleReturnLines.quantity, taxable: saleReturnLines.taxableValue, cgst: saleReturnLines.cgstAmount, sgst: saleReturnLines.sgstAmount, igst: saleReturnLines.igstAmount, cess: saleReturnLines.cessAmount, total: saleReturnLines.lineTotal })
      .from(saleReturnLines)
      .innerJoin(saleReturns, eq(saleReturns.id, saleReturnLines.returnId))
      .where(eq(saleReturns.saleId, saleId));
    const sumPrior = (id: string, k: "quantity" | "taxable" | "cgst" | "sgst" | "igst" | "cess" | "total") =>
      prior.filter((p) => p.saleLineId === id).reduce((a, p) => a.plus(D(p[k])), D(0));

    const settings = await getAllSettings(tx);
    const unitNames = await unitNameMap(tx);
    const computed = input.lines.map((req) => {
      const l = lines.find((x) => x.id === req.saleLineId);
      if (!l || l.lineType !== "item") throw invalid("Unknown line in return");
      const q = D(req.quantity);
      const already = sumPrior(l.id, "quantity");
      const remaining = D(l.quantity).minus(already);
      if (q.lessThanOrEqualTo(0) || q.greaterThan(remaining)) throw invalid(`${l.sku}: you can return at most ${remaining.toString()} more`);
      const fullRemainder = q.equals(remaining);
      // Final return of a line takes exactly what's left, so totals reconcile to the paisa.
      const part = (field: "taxableValue" | "cgstAmount" | "sgstAmount" | "igstAmount" | "cessAmount" | "lineTotal", k: "taxable" | "cgst" | "sgst" | "igst" | "cess" | "total") =>
        fullRemainder ? D(l[field]).minus(sumPrior(l.id, k)) : r2(D(l[field]).times(q).div(D(l.quantity)));
      let taxable = part("taxableValue", "taxable");
      let cgst = part("cgstAmount", "cgst");
      let sgst = part("sgstAmount", "sgst");
      let igst = part("igstAmount", "igst");
      let cess = part("cessAmount", "cess");
      if (!fullRemainder) {
        // Re-derive tax from the proportional net to keep CGST = SGST and totals exact.
        const net = r2(D(l.netAmount).times(q).div(D(l.quantity)));
        const t = computeTax(net, D(l.gstRate), D(l.cessRate), l.priceIncludesTax, sale.taxMode);
        taxable = t.taxable;
        cgst = t.cgst;
        sgst = t.sgst;
        igst = t.igst;
        cess = t.cess;
      }
      const total = taxable.plus(cgst).plus(sgst).plus(igst).plus(cess);
      const costTotal = l.unitCost ? r2(D(l.unitCost).times(q)) : null;
      return { l, q, taxable, cgst, sgst, igst, cess, total, costTotal };
    });

    const linesTotal = computed.reduce((a, c) => a.plus(c.total), D(0));
    const alreadyCredited = await creditedTotal(tx, saleId);
    const everythingReturned = lines
      .filter((l) => l.lineType === "item")
      .every((l) => {
        const now = computed.find((c) => c.l.id === l.id)?.q ?? D(0);
        return sumPrior(l.id, "quantity").plus(now).equals(D(l.quantity));
      });
    let grand = sale.roundOffMode === "nearest_rupee" ? r0(linesTotal) : linesTotal;
    if (everythingReturned && !D(sale.chargesTotal).greaterThan(0)) grand = D(sale.grandTotal).minus(alreadyCredited);
    if (alreadyCredited.plus(grand).greaterThan(D(sale.grandTotal))) grand = D(sale.grandTotal).minus(alreadyCredited);
    const roundOff = grand.minus(linesTotal);

    const now = new Date();
    const seriesKey = sale.isTraining ? "training" : "credit_note";
    const prefix = sale.isTraining ? settings.documents.prefixes.training : settings.documents.prefixes.credit_note;
    const { seq, fy, docNumber } = await allocateDocNumber(tx, seriesKey, prefix, now);
    const invSnap = invoice.snapshot as DocSnapshot;
    const docLines: DocLine[] = computed.map((c, i) => ({
      ...lineSnapshot(c.l, i, unitNames),
      quantity: c.q.toString(),
      discount: "0.00",
      taxableValue: m(c.taxable),
      cgstAmount: m(c.cgst),
      sgstAmount: m(c.sgst),
      igstAmount: m(c.igst),
      cessAmount: m(c.cess),
      total: m(c.total),
    }));
    const sumK = (k: "taxable" | "cgst" | "sgst" | "igst" | "cess") => computed.reduce((a, c) => a.plus(c[k]), D(0));
    const taxTotal = sumK("cgst").plus(sumK("sgst")).plus(sumK("igst")).plus(sumK("cess"));

    // Refund (default: what the customer actually paid towards these goods)
    const netPaid = D(sale.amountPaid).minus(D(sale.amountRefunded));
    const dueBefore = D(sale.grandTotal).minus(alreadyCredited).minus(netPaid);
    const creditAgainstDues = dueBefore.greaterThan(0) ? (dueBefore.lessThan(grand) ? dueBefore : grand) : D(0);
    const refundAmount = input.refund ? (input.refund.amount ? D(input.refund.amount) : grand.minus(creditAgainstDues)) : D(0);
    if (refundAmount.greaterThan(grand)) throw invalid("Refund cannot exceed the credit note amount");

    const snapshot: DocSnapshot = {
      ...invSnap,
      docType: "credit_note",
      title: "CREDIT NOTE",
      subtitle: settings.tax.registrationType === "regular" ? "Issued under Section 34 of the CGST Act" : "Goods returned",
      number: docNumber,
      issuedAt: now.toISOString(),
      financialYear: fy,
      validUntil: null,
      original: { number: invoice.docNumber, issuedAt: invoice.issuedAt.toISOString(), docType: invoice.docType as DocType },
      reason: input.reason.trim(),
      seller: sellerOf(settings),
      lines: docLines,
      taxSummary: taxSummaryOf(docLines),
      totals: {
        gross: m(linesTotal),
        lineDiscount: "0.00",
        cartDiscount: "0.00",
        taxable: m(sumK("taxable")),
        cgst: m(sumK("cgst")),
        sgst: m(sumK("sgst")),
        igst: m(sumK("igst")),
        cess: m(sumK("cess")),
        taxTotal: m(taxTotal),
        charges: "0.00",
        roundOff: m(roundOff),
        grandTotal: m(grand),
        amountInWords: amountInWords(grand),
      },
      payments: refundAmount.greaterThan(0) ? [{ method: input.refund!.method, reference: input.refund!.reference ?? null, amount: m(refundAmount), at: now.toISOString(), verification: null, direction: "refund" }] : [],
      paymentStatus: refundAmount.greaterThan(0) ? "Refunded" : creditAgainstDues.greaterThan(0) ? "Adjusted against amount due" : "Credit not refunded",
      amountPaid: m(refundAmount),
      balanceDue: "0.00",
      issuedBy: actor.displayName,
      notes: null,
    };
    const [doc] = await tx
      .insert(documents)
      .values({
        saleId,
        docType: "credit_note",
        seriesKey,
        financialYear: fy,
        seq,
        docNumber,
        isTraining: sale.isTraining,
        issuedAt: now,
        issuedBy: actor.id,
        snapshot,
        taxableTotal: m(sumK("taxable")),
        taxTotal: m(taxTotal),
        grandTotal: m(grand),
        originalDocumentId: invoice.id,
        shareToken: settings.documents.shareLinksEnabled ? randomBytes(24).toString("base64url") : null,
      })
      .returning();
    const [ret] = await tx
      .insert(saleReturns)
      .values({ saleId, creditNoteDocumentId: doc.id, reason: input.reason.trim(), taxableTotal: m(sumK("taxable")), taxTotal: m(taxTotal), grandTotal: m(grand), createdBy: actor.id })
      .returning();
    for (const c of computed) {
      await tx.insert(saleReturnLines).values({
        returnId: ret.id,
        saleLineId: c.l.id,
        quantity: c.q.toString(),
        taxableValue: m(c.taxable),
        cgstAmount: m(c.cgst),
        sgstAmount: m(c.sgst),
        igstAmount: m(c.igst),
        cessAmount: m(c.cess),
        lineTotal: m(c.total),
        costTotal: c.costTotal ? m(c.costTotal) : null,
      });
    }
    if (refundAmount.greaterThan(0)) {
      await recordRefund(tx, actor, saleId, { amount: m(refundAmount), method: input.refund!.method, reference: input.refund!.reference, note: `Credit note ${docNumber}`, creditNoteDocumentId: doc.id });
    } else {
      await recomputeSalePayments(tx, saleId);
    }
    if (settings.inventory.enabled && settings.inventory.deductStockOnSale && !sale.isTraining) {
      const [loc] = await tx.select().from(stockLocations).where(eq(stockLocations.isDefault, true));
      if (loc) {
        for (const c of computed) {
          await tx.insert(stockMovements).values({ variantId: c.l.variantId!, locationId: loc.id, quantityChange: c.q.toString(), movementType: "customer_return", referenceType: "document", referenceId: doc.id, unitCost: c.l.unitCost, createdBy: actor.id });
        }
      }
    }
    await audit(tx, auditActorOf(actor), {
      action: "document.credit_note",
      entityType: "document",
      entityId: doc.id,
      summary: `Issued credit note ${docNumber} against ${invoice.docNumber}: ₹${m(grand)}${refundAmount.greaterThan(0) ? `, refunded ₹${m(refundAmount)}` : ""}`,
      data: { saleId, originalDocumentId: invoice.id, reason: input.reason, lines: computed.map((c) => ({ sku: c.l.sku, qty: c.q.toString(), total: m(c.total) })) },
    });
    return doc;
  });
}

/* ------------------------------------------------------------------ */
/* Read / print / share                                                */
/* ------------------------------------------------------------------ */

export async function getDocument(actor: Actor, documentId: string) {
  const db = getDb();
  const [row] = await db
    .select({ d: documents, saleCreatedBy: sales.createdBy, issuedByName: users.displayName })
    .from(documents)
    .innerJoin(sales, eq(sales.id, documents.saleId))
    .innerJoin(users, eq(users.id, documents.issuedBy))
    .where(eq(documents.id, documentId));
  if (!row) throw notFound("Document");
  if (!canSeeSale(actor, { createdBy: row.saleCreatedBy })) throw forbidden();
  return { ...row.d, snapshot: row.d.snapshot as DocSnapshot, issuedByName: row.issuedByName };
}

export async function getDocumentByShareToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const db = getDb();
  const [d] = await db.select().from(documents).where(eq(documents.shareToken, token));
  if (!d) return null;
  const settings = await getAllSettings();
  if (!settings.documents.shareLinksEnabled) return null;
  return { id: d.id, docNumber: d.docNumber, docType: d.docType, status: d.status, issuedAt: d.issuedAt, snapshot: d.snapshot as DocSnapshot, cancelReason: d.cancelReason };
}

/** Lock a document for update after checking the actor may see its sale. */
async function lockVisibleDocument(tx: Tx, actor: Actor, documentId: string) {
  const [d] = await tx.select().from(documents).where(eq(documents.id, documentId)).for("update");
  if (!d) throw notFound("Document");
  const [sale] = await tx.select({ createdBy: sales.createdBy }).from(sales).where(eq(sales.id, d.saleId));
  if (!sale || !canSeeSale(actor, sale)) throw forbidden();
  return d;
}

export async function recordPrint(actor: Actor, documentId: string, kind: "print" | "pdf") {
  requirePermission(actor, ["documents.reprint", "documents.issue"]);
  const db = getDb();
  await db.transaction(async (tx) => {
    const d = await lockVisibleDocument(tx, actor, documentId);
    await tx.update(documents).set({ printCount: d.printCount + 1, lastPrintedAt: new Date() }).where(eq(documents.id, documentId));
    if (d.printCount > 0) {
      await audit(tx, auditActorOf(actor), { action: "document.reprint", entityType: "document", entityId: d.id, summary: `${kind === "pdf" ? "Downloaded" : "Reprinted"} ${d.docNumber} (copy ${d.printCount + 1})` });
    }
  });
}

export async function setShareLink(actor: Actor, documentId: string, enabled: boolean) {
  requirePermission(actor, "documents.share");
  const db = getDb();
  return db.transaction(async (tx) => {
    const d = await lockVisibleDocument(tx, actor, documentId);
    const token = enabled ? d.shareToken ?? randomBytes(24).toString("base64url") : null;
    await tx.update(documents).set({ shareToken: token }).where(eq(documents.id, documentId));
    await audit(tx, auditActorOf(actor), {
      action: enabled ? "document.share_enabled" : "document.share_revoked",
      entityType: "document",
      entityId: d.id,
      summary: `${enabled ? "Enabled" : "Revoked"} customer link for ${d.docNumber}`,
    });
    return token;
  });
}

export interface DocumentFilter {
  q?: string;
  docType?: DocType;
  status?: "issued" | "cancelled";
  from?: Date;
  to?: Date;
  includeTraining?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listDocuments(actor: Actor, f: DocumentFilter) {
  requirePermission(actor, ["documents.reprint", "documents.issue", "sales.view_all"]);
  const db = getDb();
  const where: SQL[] = [];
  if (!can(actor, "sales.view_all")) where.push(eq(sales.createdBy, actor.id));
  if (f.docType) where.push(eq(documents.docType, f.docType));
  if (f.status) where.push(eq(documents.status, f.status));
  if (f.from) where.push(gte(documents.issuedAt, f.from));
  if (f.to) where.push(lte(documents.issuedAt, f.to));
  if (!f.includeTraining) where.push(eq(documents.isTraining, false));
  if (f.q?.trim()) {
    const like = `%${f.q.trim()}%`;
    where.push(or(ilike(documents.docNumber, like), ilike(sales.saleNumber, like), ilike(customers.name, like), ilike(customers.mobile, like))!);
  }
  const pageSize = Math.min(f.pageSize ?? 50, 200);
  const page = Math.max(1, f.page ?? 1);
  const rows = await db
    .select({
      id: documents.id,
      docType: documents.docType,
      docNumber: documents.docNumber,
      status: documents.status,
      issuedAt: documents.issuedAt,
      grandTotal: documents.grandTotal,
      taxTotal: documents.taxTotal,
      isTraining: documents.isTraining,
      saleId: sales.id,
      saleNumber: sales.saleNumber,
      customerName: customers.name,
      issuedByName: users.displayName,
      printCount: documents.printCount,
      total: sql<number>`count(*) over ()::int`,
    })
    .from(documents)
    .innerJoin(sales, eq(sales.id, documents.saleId))
    .innerJoin(users, eq(users.id, documents.issuedBy))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(documents.issuedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { total: rows[0]?.total ?? 0, page, pageSize, items: rows.map(({ total: _t, ...r }) => r) };
}
