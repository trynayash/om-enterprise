/**
 * HTML rendering of an issued document — from its frozen snapshot ONLY.
 * Print-ready on A4 (browser print). Used by the POS, dashboard and customer share links.
 */
import type { DocSnapshot } from "@/lib/document-types";
import { formatINR, formatQty } from "@/lib/money";
import { LogoMark } from "@/components/ui/logo";
import { cn } from "@/components/ui/cn";

function dt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const METHOD: Record<string, string> = { upi: "UPI", cash: "Cash", card: "Card", bank_transfer: "Bank transfer", cheque: "Cheque", other: "Other" };

export function DocumentView({
  snapshot: s,
  status = "issued",
  cancelReason,
  copyLabel,
  className,
}: {
  snapshot: DocSnapshot;
  status?: "issued" | "cancelled";
  cancelReason?: string | null;
  copyLabel?: string | null;
  className?: string;
}) {
  const inter = s.supplyType === "inter";
  return (
    <article className={cn("relative mx-auto w-full max-w-[210mm] overflow-hidden bg-white p-6 text-[13px] text-navy-900 sm:p-10 print:p-0", className)}>
      {(s.watermark || status === "cancelled") && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-10">
          {s.watermark && <div className="-rotate-[25deg] text-center text-2xl font-black uppercase tracking-widest text-red-600/15 sm:text-4xl">{s.watermark}</div>}
          {status === "cancelled" && <div className="-rotate-[25deg] text-7xl font-black uppercase tracking-widest text-red-600/20">Cancelled</div>}
        </div>
      )}
      {s.declarationTop && <p className="mb-3 text-center text-xs font-bold uppercase tracking-wide">{s.declarationTop}</p>}

      <header className="flex flex-col gap-4 border-b-2 border-gold-500 pb-4 sm:flex-row sm:justify-between">
        <div className="flex gap-3">
          <LogoMark className="h-14 w-14" />
          <div>
            <div className="text-xl font-extrabold tracking-[0.06em]">{s.seller.name}</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gold-600">{s.seller.tagline}</div>
            <div className="mt-1 text-xs leading-relaxed text-navy-600">
              {s.seller.addressLines.map((l) => (
                <div key={l}>{l}</div>
              ))}
              <div>
                Phone/WhatsApp: {s.seller.phone}
                {s.seller.email ? ` · ${s.seller.email}` : ""}
              </div>
              {s.seller.gstin && <div className="font-bold text-navy-900">GSTIN: {s.seller.gstin}</div>}
            </div>
          </div>
        </div>
        <div className="sm:text-right">
          <div className="text-xl font-extrabold tracking-wide">{s.title}</div>
          {s.subtitle && <div className="text-xs text-navy-500">{s.subtitle}</div>}
          <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs sm:justify-end">
            <dt className="text-navy-500">No.</dt>
            <dd className="font-bold">{s.number}</dd>
            <dt className="text-navy-500">Date</dt>
            <dd className="font-semibold">{dt(s.issuedAt)}</dd>
            <dt className="text-navy-500">Sale ref.</dt>
            <dd className="font-semibold">{s.saleNumber}</dd>
            {s.validUntil && (
              <>
                <dt className="text-navy-500">Valid until</dt>
                <dd className="font-semibold">{dt(s.validUntil)}</dd>
              </>
            )}
            {s.original && (
              <>
                <dt className="text-navy-500">Against</dt>
                <dd className="font-semibold">
                  {s.original.number} ({dt(s.original.issuedAt)})
                </dd>
              </>
            )}
            {s.showTax && (
              <>
                <dt className="text-navy-500">Place of supply</dt>
                <dd className="font-semibold">
                  {s.placeOfSupply.stateName} ({s.placeOfSupply.stateCode})
                </dd>
                <dt className="text-navy-500">Reverse charge</dt>
                <dd className="font-semibold">{s.reverseCharge ? "Yes" : "No"}</dd>
              </>
            )}
          </dl>
          {copyLabel && <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gold-600">{copyLabel}</div>}
        </div>
      </header>

      <section className="mt-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gold-600">{s.docType === "quotation" ? "Quotation for" : "Bill to"}</div>
        {s.buyer ? (
          <div className="mt-0.5 text-xs leading-relaxed text-navy-600">
            <div className="text-sm font-bold text-navy-900">{s.buyer.businessName ? `${s.buyer.businessName} (${s.buyer.name})` : s.buyer.name}</div>
            {[s.buyer.address, [s.buyer.city, s.buyer.pincode].filter(Boolean).join(" "), s.buyer.stateName ? `${s.buyer.stateName} (${s.buyer.stateCode})` : null].filter(Boolean).join(", ")}
            {s.buyer.mobile && <div>Mobile: {s.buyer.mobile}</div>}
            {s.buyer.gstin && <div className="font-bold text-navy-900">GSTIN: {s.buyer.gstin}</div>}
          </div>
        ) : (
          <div className="mt-0.5 text-sm font-bold">Cash sale</div>
        )}
        {s.reason && <div className="mt-1 text-xs text-navy-600">Reason: {s.reason}</div>}
      </section>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-xs tabular">
          <thead>
            <tr className="bg-navy-900 text-left text-[11px] uppercase tracking-wide text-white">
              <th className="px-2 py-2 text-center">#</th>
              <th className="px-2 py-2">Item{s.showTax ? " (HSN)" : ""}</th>
              <th className="px-2 py-2 text-right">Qty</th>
              <th className="px-2 py-2 text-right">Rate</th>
              <th className="px-2 py-2 text-right">Disc.</th>
              {s.showTax && <th className="px-2 py-2 text-right">Taxable</th>}
              {s.showTax && <th className="px-2 py-2 text-right">{inter ? "IGST" : "CGST / SGST"}</th>}
              <th className="px-2 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l) => (
              <tr key={l.sl} className="border-b border-navy-100 align-top even:bg-navy-50/50">
                <td className="px-2 py-1.5 text-center text-navy-500">{l.sl}</td>
                <td className="px-2 py-1.5">
                  <div className="font-medium">
                    {l.description}
                    {l.isSample && <span className="ml-1 rounded bg-red-600 px-1 text-[9px] font-bold text-white">SAMPLE</span>}
                  </div>
                  <div className="text-[11px] text-navy-500">{[l.hsn ? `HSN ${l.hsn}` : null, l.sku].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right">
                  {formatQty(l.quantity)} {l.unit}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right">
                  {formatINR(l.unitPrice)}
                  {s.showTax && <div className="text-[10px] text-navy-400">{l.priceIncludesTax ? "incl. GST" : "excl. GST"}</div>}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right">{Number(l.discount) ? formatINR(l.discount) : "—"}</td>
                {s.showTax && <td className="whitespace-nowrap px-2 py-1.5 text-right">{formatINR(l.taxableValue)}</td>}
                {s.showTax && (
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    {Number(l.gstRate) === 0 ? (
                      "Exempt"
                    ) : inter ? (
                      <>
                        {l.igstRate}% · {formatINR(l.igstAmount)}
                      </>
                    ) : (
                      <>
                        <div>
                          {l.cgstRate}% · {formatINR(l.cgstAmount)}
                        </div>
                        <div>
                          {l.sgstRate}% · {formatINR(l.sgstAmount)}
                        </div>
                      </>
                    )}
                  </td>
                )}
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold">{formatINR(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-6 sm:grid-cols-[1fr_auto]">
        <div className="space-y-4 text-xs">
          {s.showTax && s.taxSummary.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gold-600">Tax summary (HSN-wise)</div>
              <table className="mt-1 tabular">
                <thead>
                  <tr className="text-[11px] text-navy-500">
                    <th className="pr-4 text-left font-semibold">HSN</th>
                    <th className="pr-4 text-right font-semibold">Rate</th>
                    <th className="pr-4 text-right font-semibold">Taxable</th>
                    {inter ? <th className="text-right font-semibold">IGST</th> : (
                      <>
                        <th className="pr-4 text-right font-semibold">CGST</th>
                        <th className="text-right font-semibold">SGST</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {s.taxSummary.map((r) => (
                    <tr key={`${r.hsn}-${r.gstRate}`}>
                      <td className="pr-4">{r.hsn ?? "—"}</td>
                      <td className="pr-4 text-right">{r.gstRate}%</td>
                      <td className="pr-4 text-right">{formatINR(r.taxableValue)}</td>
                      {inter ? <td className="text-right">{formatINR(r.igst)}</td> : (
                        <>
                          <td className="pr-4 text-right">{formatINR(r.cgst)}</td>
                          <td className="text-right">{formatINR(r.sgst)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {s.docType !== "quotation" && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gold-600">{s.docType === "credit_note" ? "Refund" : "Payment"}</div>
              {s.payments.map((p, i) => (
                <div key={i} className="text-navy-700">
                  {p.direction === "refund" ? "Refund" : "Received"} · {METHOD[p.method] ?? p.method}
                  {p.reference ? ` · Ref ${p.reference}` : ""} · <span className="font-semibold">{formatINR(p.amount)}</span>
                </div>
              ))}
              <div className="font-bold">
                Status: {s.paymentStatus}
                {Number(s.balanceDue) ? ` · Balance due ${formatINR(s.balanceDue)}` : ""}
              </div>
            </div>
          )}
        </div>
        <dl className="min-w-[240px] text-sm tabular">
          <Row k="Gross amount" v={formatINR(s.totals.gross)} />
          {Number(s.totals.lineDiscount) > 0 && <Row k="Item discounts" v={`− ${formatINR(s.totals.lineDiscount)}`} />}
          {Number(s.totals.cartDiscount) > 0 && <Row k="Bill discount" v={`− ${formatINR(s.totals.cartDiscount)}`} />}
          {s.showTax && <Row k="Taxable value" v={formatINR(s.totals.taxable)} />}
          {s.showTax && Number(s.totals.cgst) > 0 && <Row k="CGST" v={formatINR(s.totals.cgst)} />}
          {s.showTax && Number(s.totals.sgst) > 0 && <Row k="SGST" v={formatINR(s.totals.sgst)} />}
          {s.showTax && Number(s.totals.igst) > 0 && <Row k="IGST" v={formatINR(s.totals.igst)} />}
          {s.showTax && Number(s.totals.cess) > 0 && <Row k="Cess" v={formatINR(s.totals.cess)} />}
          {Number(s.totals.roundOff) !== 0 && <Row k="Round off" v={formatINR(s.totals.roundOff)} />}
          <div className="mt-1 flex justify-between gap-6 rounded-lg bg-navy-900 px-3 py-2 text-base font-extrabold text-white">
            <dt>{s.docType === "credit_note" ? "Credit total" : "Grand total"}</dt>
            <dd>{formatINR(s.totals.grandTotal)}</dd>
          </div>
          <div className="mt-1 max-w-[280px] text-right text-[11px] text-navy-500">{s.totals.amountInWords}</div>
        </dl>
      </div>

      <footer className="mt-6 grid gap-4 border-t border-navy-100 pt-4 text-xs sm:grid-cols-[1fr_auto]">
        <div className="space-y-2 text-navy-600">
          {s.terms.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gold-600">Terms</div>
              <ol className="list-inside list-decimal">
                {s.terms.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ol>
            </div>
          )}
          {s.bankDetails && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gold-600">Bank details</div>
              <div className="whitespace-pre-line">{s.bankDetails}</div>
            </div>
          )}
          <div className="text-navy-400">Prepared by {s.issuedBy}. Computer-generated document.</div>
          {status === "cancelled" && cancelReason && <div className="font-bold text-red-700">Cancelled: {cancelReason}</div>}
        </div>
        <div className="self-end text-right">
          <div className="mb-1 h-10 w-44 border-b border-navy-300 sm:ml-auto" />
          <div className="font-bold">{s.signatoryLabel}</div>
        </div>
      </footer>
      {s.footerNote && <p className="mt-4 text-center text-xs font-semibold text-gold-600">{s.footerNote}</p>}
    </article>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-6 py-0.5">
      <dt className="text-navy-500">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}
