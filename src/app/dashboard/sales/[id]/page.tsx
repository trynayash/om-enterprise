import { Suspense } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { getSale } from "@/server/services/sales";
import { entityHistory } from "@/server/services/audit-log";
import { D, formatINR, m } from "@/lib/money";
import { stateName } from "@/lib/india";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, PageHeader, PageSkeleton } from "@/components/ui/page";
import { Badge, SampleBadge, StatusBadge } from "@/components/ui/badge";
import { CASH_SALE, TrainingBadge, actorLabel } from "@/components/staff/labels";
import { lineDescription, optionLabel } from "@/lib/line-description";
import { DateTime, Money, Qty } from "@/components/ui/money";
import { SaleActions, ReversePaymentButton, type ReturnableLine } from "@/components/dashboard/ops/sale-actions";
import { displayNames, returnSummary, unitMap } from "@/components/dashboard/ops/sale-extras";
import { DOC_LABEL, METHOD_LABEL, VERIFICATION_LABEL, loadOr404 } from "@/components/dashboard/ops/guard";
import { BackLink } from "@/components/dashboard/back-link";
import { TitleStamps } from "@/components/dashboard/title-stamps";
import { rowHover, tdCode, tdMuted, tdNum, tdText, th, thNum } from "@/components/dashboard/table";

export const metadata = { title: "Sale" };

export default function SaleDetailPage({ params }: PageProps<"/dashboard/sales/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SaleDetail params={params} />
    </Suspense>
  );
}

async function SaleDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor(["sales.view_all", "sales.create"]);
  const { id } = await params;
  const data = await loadOr404(getSale(actor, id));
  const { sale, lines, payments, documents, approvals, customer, canSeeCosts } = data;
  const [{ returned, creditedTotal, returnCount }, names, units] = [await returnSummary(id), await displayNames(payments.map((p) => p.verifiedBy).concat(payments.map((p) => p.reversedBy))), await unitMap()];
  const history = can(actor, "audit.view") || can(actor, "sales.view_all") ? await entityHistory(actor, "sale", id) : [];

  const bill = documents.find((d) => ["tax_invoice", "bill_of_supply", "cash_memo"].includes(d.docType) && d.status === "issued") ?? null;
  const netPaid = D(sale.amountPaid).minus(D(sale.amountRefunded));
  const balance = D(sale.grandTotal).minus(D(creditedTotal)).minus(netPaid);
  const own = sale.createdBy === actor.id;
  const items = lines.filter((l) => l.lineType === "item");
  const charges = lines.filter((l) => l.lineType === "charge");

  const returnable: ReturnableLine[] = items.map((l) => ({
    id: l.id,
    description: lineDescription(null, l.productName, l.variantName),
    sku: l.sku,
    unit: units.get(l.unitCode)?.name ?? l.unitCode,
    sold: l.quantity,
    returned: returned.get(l.id) ?? "0",
    unitDecimals: units.get(l.unitCode)?.decimals ?? 0,
    netPerUnit: m(D(l.lineTotal).div(D(l.quantity))),
  }));

  const canCancel = (sale.status === "draft" || sale.status === "finalized") && netPaid.isZero() && can(actor, "sales.create") && (own || can(actor, "sales.cancel"));
  const canReopen = sale.status === "finalized" && D(sale.amountPaid).isZero() && can(actor, "sales.create") && (own || can(actor, "sales.view_all"));
  const canReturn = sale.status === "completed" && !!bill && can(actor, "documents.credit_note") && returnable.some((l) => D(l.sold).greaterThan(D(l.returned)));
  const canCancelBill = !!bill && returnCount === 0 && can(actor, "documents.cancel") && (netPaid.isZero() || can(actor, "payments.refund"));

  return (
    <div className="space-y-6">
      <BackLink href="/dashboard/sales">All sales</BackLink>
      <PageHeader
        eyebrow="Sale"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {sale.saleNumber}
            <TitleStamps>
              <StatusBadge status={sale.status} />
              {sale.status !== "draft" && sale.status !== "cancelled" && <StatusBadge status={sale.paymentStatus} />}
              {sale.isTraining && <TrainingBadge label="Training sale" />}
            </TitleStamps>
          </span>
        }
        description={
          <>
            Started by {data.createdByName} on <DateTime value={sale.createdAt} /> · {data.priceListName} price list
            {sale.source === "website_order" && " · from a website order"}
          </>
        }
        actions={
          <SaleActions
            saleId={sale.id}
            saleNumber={sale.saleNumber}
            status={sale.status}
            canOpenPos={can(actor, "sales.create") && (own || can(actor, "sales.view_all"))}
            canCancel={canCancel}
            canReopen={canReopen}
            canReturn={canReturn}
            bill={bill ? { id: bill.id, number: bill.docNumber, canCancel: canCancelBill } : null}
            netPaid={m(netPaid)}
            lines={returnable}
          />
        }
      />

      {sale.isTraining && <Alert tone="warning">This is a training sale (it contains SAMPLE products). It is excluded from all reports and its documents are watermarked.</Alert>}
      {sale.status === "cancelled" && (
        <Alert tone="danger" title="Cancelled">
          {sale.cancelReason ?? "No reason recorded"} {sale.cancelledAt && <>· <DateTime value={sale.cancelledAt} /></>}
        </Alert>
      )}
      {sale.approvalStatus === "pending" && <Alert tone="warning">A discount approval is pending for this sale.</Alert>}

      <Card>
        <CardHeader title="Items" description={`${items.length} item line${items.length === 1 ? "" : "s"}${charges.length ? ` · ${charges.length} charge(s)` : ""} · ${sale.taxMode === "none" ? "GST not charged" : sale.taxMode === "inter" ? "Inter-state (IGST)" : "Intra-state (CGST + SGST)"} · place of supply ${stateName(sale.placeOfSupplyStateCode)}`} />
        <div className="overflow-x-auto">
          <table className="stack-sm w-full min-w-[820px]">
            <thead>
              <tr>
                <th className={th}>Item</th>
                <th className={thNum}>Qty</th>
                <th className={thNum}>Price</th>
                <th className={thNum}>Discount</th>
                <th className={thNum}>Taxable</th>
                <th className={thNum}>GST</th>
                <th className={thNum}>Total</th>
                {canSeeCosts && <th className={thNum}>Cost / profit</th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const disc = D(l.lineDiscountAmount).plus(D(l.cartDiscountShare));
                const tax = D(l.cgstAmount).plus(D(l.sgstAmount)).plus(D(l.igstAmount)).plus(D(l.cessAmount));
                const ret = returned.get(l.id);
                return (
                  <tr key={l.id} className={rowHover}>
                    <td data-label="Item" className={tdText}>
                      <div className="font-medium">
                        {l.lineType === "charge" ? l.productName : lineDescription(l.brandName, l.productName, null)}
                        {l.isSample && <SampleBadge label="Sample" className="ml-1.5" />}
                      </div>
                      {optionLabel(l.variantName) && <div className="text-xs text-navy-600">{l.variantName}</div>}
                      <div className="mt-0.5 font-mono text-[11.5px] text-navy-500">
                        {[l.sku, l.hsnCode ? `HSN ${l.hsnCode}` : null].filter(Boolean).join(" · ")}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {l.priceSource === "override" && <Badge tone="amber">Price changed: {l.overrideReason}</Badge>}
                        {l.priceSource === "quantity_tier" && <Badge>Quantity price</Badge>}
                        {l.priceSource === "quotation" && <Badge>Quoted price</Badge>}
                        {l.lineDiscountReason && <Badge tone="amber">{l.lineDiscountReason}</Badge>}
                        {canSeeCosts && l.belowCost && <Badge tone="red">Below cost</Badge>}
                        {canSeeCosts && !l.belowCost && l.belowMarginFloor && <Badge tone="amber">Below margin floor</Badge>}
                        {ret && <Badge>Returned {ret}</Badge>}
                      </div>
                    </td>
                    <td data-label="Qty" className={tdNum}>
                      <Qty value={l.quantity} unit={units.get(l.unitCode)?.name ?? l.unitCode} />
                    </td>
                    <td data-label="Price" className={tdNum}>
                      <Money value={l.unitPrice} />
                      {l.priceListUnitPrice !== l.unitPrice && (
                        <div className="text-xs text-navy-400 line-through">
                          <Money value={l.priceListUnitPrice} />
                        </div>
                      )}
                      <div className="font-sans text-[11px] text-navy-400">{sale.taxMode === "none" ? "" : l.priceIncludesTax ? "incl. GST" : "excl. GST"}</div>
                    </td>
                    <td data-label="Discount" className={tdNum}>{disc.isZero() ? <span className="text-navy-300">—</span> : <Money value={m(disc)} />}</td>
                    <td data-label="Taxable" className={tdNum}>
                      <Money value={l.taxableValue} />
                    </td>
                    <td data-label="GST" className={tdNum}>
                      {tax.isZero() ? (
                        <span className="text-navy-300">—</span>
                      ) : (
                        <>
                          <Money value={m(tax)} />
                          <div className="text-[11px] text-navy-400">{D(l.gstRate).toString()}%</div>
                        </>
                      )}
                    </td>
                    <td data-label="Total" className={`${tdNum} font-semibold`}>
                      <Money value={l.lineTotal} />
                    </td>
                    {canSeeCosts && (
                      <td data-label="Cost / profit" className={tdNum}>
                        {l.costTotal ? (
                          <>
                            <div>
                              Cost <Money value={l.costTotal} />
                            </div>
                            <div className={D(l.grossProfit ?? 0).isNegative() ? "font-semibold text-red-700" : "text-emerald-700"}>
                              GP <Money value={l.grossProfit} />
                            </div>
                          </>
                        ) : l.lineType === "item" ? (
                          <span className="font-sans text-navy-400">Cost unknown</span>
                        ) : null}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Payments" description="Payment status is separate from the bill. A QR shown to the customer is NOT proof of payment until verified." />
            {payments.length ? (
              <div className="relative overflow-x-auto">
                <table className="stack-sm w-full min-w-[640px]">
                  <thead>
                    <tr>
                      <th className={th}>When</th>
                      <th className={th}>Method</th>
                      <th className={th}>Reference</th>
                      <th className={th}>Verification</th>
                      <th className={th}>Status</th>
                      <th className={thNum}>Amount</th>
                      <th className={th}>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className={rowHover}>
                        <td data-label="When" className={`${tdMuted} whitespace-nowrap`}>
                          <DateTime value={p.verifiedAt ?? p.createdAt} />
                        </td>
                        <td data-label="Method" className={tdText}>
                          <span className="flex flex-wrap items-center gap-1.5">
                            {p.direction === "refund" ? <Badge>Refund</Badge> : null} {METHOD_LABEL[p.method] ?? p.method}
                          </span>
                          {p.provider === "razorpay" && <div className="text-xs text-navy-500">Razorpay QR</div>}
                        </td>
                        <td data-label="Reference" className={tdCode}>{p.reference ?? <span className="text-navy-300">—</span>}</td>
                        <td data-label="Verification" className={`${tdMuted} text-xs`}>
                          {p.verificationMethod ? VERIFICATION_LABEL[p.verificationMethod] ?? p.verificationMethod : "Not verified"}
                          {p.verifiedBy && <div>by {names.get(p.verifiedBy) ?? "staff"}</div>}
                          {p.status === "reversed" && (
                            <div className="text-red-700">
                              Reversed by {names.get(p.reversedBy ?? "") ?? "staff"}: {p.reversalReason}
                            </div>
                          )}
                          {p.failureReason && <div className="text-navy-500">{p.failureReason}</div>}
                        </td>
                        <td data-label="Status" className={tdText}>
                          <StatusBadge status={p.status} />
                        </td>
                        <td data-label="Amount" className={`${tdNum} font-semibold`}>
                          <Money value={p.amount} />
                          {p.tenderedAmount && p.tenderedAmount !== p.amount && (
                            <div className="mt-0.5 text-xs font-normal text-navy-500">
                              Tendered <Money value={p.tenderedAmount} />
                            </div>
                          )}
                        </td>
                        <td className={`${tdText} text-right`}>{p.status === "successful" && sale.status !== "cancelled" && can(actor, "payments.reverse") && <ReversePaymentButton paymentId={p.id} amount={p.amount} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <CardBody>
                <p className="text-sm text-navy-500">No payments recorded.</p>
              </CardBody>
            )}
          </Card>

          {approvals.length > 0 && (
            <Card>
              <CardHeader title="Discount approvals" />
              <ul className="divide-y divide-navy-100">
                {approvals.map((a) => {
                  const details = a.details as { maxDiscountPercent?: string; reasons?: string[] };
                  return (
                    <li key={a.id} className="px-5 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={a.status} />
                        <span className="font-semibold">{details.maxDiscountPercent ? `${details.maxDiscountPercent}% discount` : "Discount"}</span>
                        <span className="text-navy-500">
                          requested by {a.requestedByName} · <DateTime value={a.requestedAt} />
                        </span>
                      </div>
                      <div className="mt-1 text-navy-600">“{a.reason}”</div>
                      {details.reasons?.length ? <div className="mt-1 text-xs text-navy-500">{details.reasons.join(" · ")}</div> : null}
                      {a.decidedByName && (
                        <div className="mt-1 text-xs text-navy-600">
                          {a.status === "approved" ? "Approved" : "Decided"} by <strong>{a.decidedByName}</strong>
                          {a.decisionChannel === "in_person" ? " in person at the counter" : a.decisionChannel === "remote" ? " from the approvals queue" : ""}
                          {a.decidedAt && <> · <DateTime value={a.decidedAt} /></>}
                          {a.decisionNote && <> — “{a.decisionNote}”</>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {history.length > 0 && (
            <Card>
              <CardHeader title="Activity" description="From the audit log — every change to this sale and who made it." />
              <ol className="relative space-y-0 px-5 py-4">
                {history.map((h, i) => (
                  <li key={h.id} className="relative border-l border-navy-200 pb-4 pl-5 last:border-transparent last:pb-0">
                    <span aria-hidden className={`absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full ring-[3px] ring-white ${i === 0 ? "bg-gold-500" : "bg-navy-300"}`} />
                    <div className="text-sm font-medium">{h.summary}</div>
                    <div className="mt-0.5 text-xs text-navy-500">
                      {actorLabel(h.actorLabel)} · <DateTime value={h.at} />
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Amounts" />
            <CardBody>
              <dl className="space-y-1.5 text-sm">
                <Row label="Items at list price" value={sale.listTotal} />
                {D(sale.lineDiscountTotal).greaterThan(0) && <Row label="Item discounts" value={`− ${formatINR(sale.lineDiscountTotal)}`} raw />}
                {D(sale.cartDiscountTotal).greaterThan(0) && <Row label={`Bill discount${sale.cartDiscountReason ? ` (${sale.cartDiscountReason})` : ""}`} value={`− ${formatINR(sale.cartDiscountTotal)}`} raw />}
                {D(sale.listTotal).minus(D(sale.subtotalGross)).greaterThan(0) && <Row label="Price changes" value={`− ${formatINR(m(D(sale.listTotal).minus(D(sale.subtotalGross))))}`} raw />}
                <Row label="Taxable value" value={sale.taxableTotal} />
                {D(sale.cgstTotal).greaterThan(0) && <Row label="CGST" value={sale.cgstTotal} />}
                {D(sale.sgstTotal).greaterThan(0) && <Row label="SGST" value={sale.sgstTotal} />}
                {D(sale.igstTotal).greaterThan(0) && <Row label="IGST" value={sale.igstTotal} />}
                {D(sale.cessTotal).greaterThan(0) && <Row label="Cess" value={sale.cessTotal} />}
                {D(sale.roundOff).isZero() ? null : <Row label="Round off" value={sale.roundOff} />}
                <div className="my-2.5 flex items-baseline justify-between rounded-md bg-navy-900 px-3 py-2.5 text-white">
                  <dt className="label-caps text-navy-200">Grand total</dt>
                  <dd className="font-mono text-base font-semibold tabular">{formatINR(sale.grandTotal)}</dd>
                </div>
                {D(sale.effectiveDiscountPercent).greaterThan(0) && <p className="text-right text-xs text-navy-500">Overall discount {sale.effectiveDiscountPercent}% vs list price</p>}
                <div className="my-2 border-t border-navy-100" />
                <Row label="Received" value={sale.amountPaid} />
                {D(sale.amountRefunded).greaterThan(0) && <Row label="Refunded" value={`− ${formatINR(sale.amountRefunded)}`} raw />}
                {D(creditedTotal).greaterThan(0) && <Row label="Credit notes" value={`− ${formatINR(creditedTotal)}`} raw />}
                {sale.status !== "cancelled" && sale.status !== "draft" && (
                  <div className={`flex justify-between font-semibold ${balance.greaterThan(0) ? "text-amber-700" : "text-emerald-700"}`}>
                    <dt>{balance.greaterThan(0) ? "Balance due" : "Balance"}</dt>
                    <dd className="font-mono text-[13px] tabular">{formatINR(m(balance.greaterThan(0) ? balance : 0))}</dd>
                  </div>
                )}
                {canSeeCosts && sale.costKnown && sale.grossProfit && (
                  <>
                    <div className="my-2 border-t border-navy-100" />
                    <Row label="Cost of goods" value={sale.costTotal} />
                    <Row label="Gross profit" value={sale.grossProfit} />
                  </>
                )}
                {canSeeCosts && !sale.costKnown && lines.some((l) => l.lineType === "item") && <p className="text-xs text-navy-400">Profit not shown: cost unknown for one or more items.</p>}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Customer" />
            <CardBody className="text-sm">
              {customer ? (
                <div className="space-y-1">
                  <Link href={`/dashboard/customers/${customer.id}`} className="font-semibold text-navy-900 hover:underline">
                    {customer.businessName ? `${customer.businessName} (${customer.name})` : customer.name}
                  </Link>
                  {customer.mobile && <div className="font-mono text-[13px] text-navy-600">{customer.mobile}</div>}
                  {customer.gstin && (
                    <div className="text-navy-600">
                      GSTIN <span className="font-mono text-[13px]">{customer.gstin}</span>
                    </div>
                  )}
                  {(customer.billingAddress || customer.city) && <div className="text-navy-500">{[customer.billingAddress, customer.city, stateName(customer.stateCode)].filter(Boolean).join(", ")}</div>}
                </div>
              ) : (
                <p className="text-navy-500">{CASH_SALE} — no customer details recorded</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Documents" />
            {documents.length ? (
              <ul className="divide-y divide-navy-100">
                {documents.map((d) => (
                  <li key={d.id}>
                    <Link href={`/dashboard/documents/${d.id}`} className={`flex items-center gap-3 px-5 py-3 ${rowHover}`}>
                      <FileText className="h-4 w-4 shrink-0 text-navy-400" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[13px] font-medium tabular">{d.docNumber}</div>
                        <div className="text-xs text-navy-500">
                          {DOC_LABEL[d.docType] ?? d.docType} · <DateTime value={d.issuedAt} />
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Money value={d.grandTotal} className="font-mono text-[13px]" />
                        {d.status === "cancelled" && <StatusBadge status="cancelled" />}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <CardBody>
                <p className="text-sm text-navy-500">No documents issued yet.</p>
              </CardBody>
            )}
          </Card>

          {sale.notes && (
            <Card>
              <CardHeader title="Notes" />
              <CardBody className="whitespace-pre-line text-sm text-navy-700">{sale.notes}</CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, raw }: { label: string; value: string | null; raw?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-navy-500">{label}</dt>
      <dd className="whitespace-nowrap font-mono text-[13px] tabular">{raw ? value : <Money value={value} />}</dd>
    </div>
  );
}
