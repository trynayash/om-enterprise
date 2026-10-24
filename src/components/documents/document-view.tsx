/**
 * HTML rendering of an issued document — from its frozen snapshot ONLY.
 * Print-ready on A4 (browser print). Used by the POS, dashboard and customer share links.
 *
 * Set like a printed trade invoice: ink rules instead of filled bars (browsers drop background
 * colours when printing by default, so nothing here relies on a fill to be legible).
 */
import type { DocSnapshot } from "@/lib/document-types";
import { formatINR, formatQty } from "@/lib/money";
import { LogoMark } from "@/components/ui/logo";
import { cn } from "@/components/ui/cn";

function dt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const METHOD: Record<string, string> = { upi: "UPI", cash: "Cash", card: "Card", bank_transfer: "Bank transfer", cheque: "Cheque", other: "Other" };

/** Small section label: brass mono caps. */
function Caption({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-gold-700", className)}>{children}</div>;
}

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
  const num = "whitespace-nowrap px-2 py-2 text-right font-mono tabular";
  return (
    <article className={cn("relative mx-auto w-full max-w-[210mm] overflow-hidden bg-white p-5 text-[13px] leading-normal text-navy-900 sm:p-10 print:p-0", className)}>
      {(s.watermark || status === "cancelled") && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-12 px-6">
          {s.watermark && (
            <div className="headline max-w-[34rem] -rotate-[24deg] text-center text-[1.75rem] font-bold uppercase leading-tight tracking-[0.04em] text-red-600/[0.14] sm:text-[2.75rem]">
              {s.watermark}
            </div>
          )}
          {status === "cancelled" && (
            <div className="-rotate-[24deg] border-[6px] border-red-600/25 px-8 py-2 font-mono text-5xl font-semibold uppercase tracking-[0.16em] text-red-600/25 sm:text-6xl">
              Cancelled
            </div>
          )}
        </div>
      )}
      {s.declarationTop && <p className="mb-4 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-navy-900">{s.declarationTop}</p>}

      {/* Seller | document */}
      <header className="grid gap-6 border-b-2 border-navy-950 pb-5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex gap-3.5">
          <LogoMark className="h-14 w-14" />
          <div className="min-w-0">
            <div className="text-[20px] font-bold leading-none tracking-[0.06em] text-navy-950 [font-stretch:108%]">{s.seller.name}</div>
            <div className="mt-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-gold-700">{s.seller.tagline}</div>
            <div className="mt-2.5 text-xs leading-relaxed text-navy-600">
              {s.seller.addressLines.map((l) => (
                <div key={l}>{l}</div>
              ))}
              <div>
                Phone/WhatsApp: <span className="font-mono text-[11.5px]">{s.seller.phone}</span>
                {s.seller.email ? ` · ${s.seller.email}` : ""}
              </div>
              {s.seller.gstin && (
                <div className="mt-0.5 font-semibold text-navy-950">
                  GSTIN: <span className="font-mono">{s.seller.gstin}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="sm:text-right">
          <div className="headline text-[1.9rem] font-bold uppercase text-navy-950">{s.title}</div>
          {s.subtitle && <div className="mt-1 max-w-[17rem] text-xs leading-snug text-navy-500 sm:ml-auto">{s.subtitle}</div>}
          <dl className="mt-3 grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-xs sm:justify-end">
            <dt className="pt-px font-mono text-[10px] uppercase tracking-[0.08em] text-navy-500 sm:text-left">No.</dt>
            <dd className="font-mono font-semibold text-navy-950 sm:text-right">{s.number}</dd>
            <dt className="pt-px font-mono text-[10px] uppercase tracking-[0.08em] text-navy-500 sm:text-left">Date</dt>
            <dd className="font-mono text-navy-950 sm:text-right">{dt(s.issuedAt)}</dd>
            <dt className="pt-px font-mono text-[10px] uppercase tracking-[0.08em] text-navy-500 sm:text-left">Sale ref.</dt>
            <dd className="font-mono text-navy-950 sm:text-right">{s.saleNumber}</dd>
            {s.validUntil && (
              <>
                <dt className="pt-px font-mono text-[10px] uppercase tracking-[0.08em] text-navy-500 sm:text-left">Valid until</dt>
                <dd className="font-mono text-navy-950 sm:text-right">{dt(s.validUntil)}</dd>
              </>
            )}
            {s.original && (
              <>
                <dt className="pt-px font-mono text-[10px] uppercase tracking-[0.08em] text-navy-500 sm:text-left">Against</dt>
                <dd className="font-mono text-navy-950 sm:text-right">
                  {s.original.number} ({dt(s.original.issuedAt)})
                </dd>
              </>
            )}
            {s.showTax && (
              <>
                <dt className="pt-px font-mono text-[10px] uppercase tracking-[0.08em] text-navy-500 sm:text-left">Place of supply</dt>
                <dd className="text-navy-950 sm:text-right">
                  {s.placeOfSupply.stateName} <span className="font-mono">({s.placeOfSupply.stateCode})</span>
                </dd>
                <dt className="pt-px font-mono text-[10px] uppercase tracking-[0.08em] text-navy-500 sm:text-left">Reverse charge</dt>
                <dd className="text-navy-950 sm:text-right">{s.reverseCharge ? "Yes" : "No"}</dd>
              </>
            )}
          </dl>
          {copyLabel && (
            <div className="mt-3 inline-block border border-navy-900 px-2 py-[3px] font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-navy-900">{copyLabel}</div>
          )}
        </div>
      </header>

      {/* Buyer */}
      <section className="mt-5">
        <Caption>{s.docType === "quotation" ? "Quotation for" : "Bill to"}</Caption>
        {s.buyer ? (
          <div className="mt-1 text-xs leading-relaxed text-navy-600">
            <div className="text-sm font-semibold text-navy-950">{s.buyer.businessName ? `${s.buyer.businessName} (${s.buyer.name})` : s.buyer.name}</div>
            {[s.buyer.address, [s.buyer.city, s.buyer.pincode].filter(Boolean).join(" "), s.buyer.stateName ? `${s.buyer.stateName} (${s.buyer.stateCode})` : null].filter(Boolean).join(", ")}
            {s.buyer.mobile && (
              <div>
                Mobile: <span className="font-mono text-[11.5px]">{s.buyer.mobile}</span>
              </div>
            )}
            {s.buyer.gstin && (
              <div className="font-semibold text-navy-950">
                GSTIN: <span className="font-mono">{s.buyer.gstin}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-1 text-sm font-semibold text-navy-950">Cash sale</div>
        )}
        {s.reason && <div className="mt-1.5 text-xs text-navy-600">Reason: {s.reason}</div>}
      </section>

      {/* Lines */}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-xs">
          <thead>
            <tr className="border-y-[1.5px] border-navy-950 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-navy-700">
              <th className="w-8 px-2 py-2 text-center font-medium">#</th>
              <th className="min-w-[11rem] px-2 py-2 font-medium">Item{s.showTax ? " (HSN)" : ""}</th>
              <th className="px-2 py-2 text-right font-medium">Qty</th>
              <th className="px-2 py-2 text-right font-medium">Rate</th>
              <th className="px-2 py-2 text-right font-medium">Disc.</th>
              {s.showTax && <th className="px-2 py-2 text-right font-medium">Taxable</th>}
              {s.showTax && <th className="px-2 py-2 text-right font-medium">{inter ? "IGST" : "CGST / SGST"}</th>}
              <th className="px-2 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="text-[11.5px]">
            {s.lines.map((l) => (
              <tr key={l.sl} className="border-b border-navy-200 align-top last:border-navy-950">
                <td className="px-2 py-2 text-center font-mono text-navy-500">{l.sl}</td>
                <td className="px-2 py-2">
                  <div className="text-[12.5px] font-medium leading-snug text-navy-950">
                    {l.description}
                    {l.isSample && (
                      <span className="ml-1.5 inline-block border border-red-600 px-1 align-[1px] font-mono text-[8.5px] font-semibold leading-[1.35] tracking-[0.08em] text-red-700">SAMPLE</span>
                    )}
                  </div>
                  <div className="mt-0.5 font-mono text-[10.5px] text-navy-500">{[l.hsn ? `HSN ${l.hsn}` : null, l.sku].filter(Boolean).join(" · ")}</div>
                </td>
                <td className={num}>
                  {formatQty(l.quantity)} <span className="font-sans text-navy-500">{l.unit}</span>
                </td>
                <td className={num}>
                  {formatINR(l.unitPrice)}
                  {s.showTax && <div className="font-sans text-[10px] text-navy-500">{l.priceIncludesTax ? "incl. GST" : "excl. GST"}</div>}
                </td>
                <td className={num}>{Number(l.discount) ? formatINR(l.discount) : <span className="text-navy-400">—</span>}</td>
                {s.showTax && <td className={num}>{formatINR(l.taxableValue)}</td>}
                {s.showTax && (
                  <td className={num}>
                    {Number(l.gstRate) === 0 ? (
                      <span className="font-sans">Exempt</span>
                    ) : inter ? (
                      <>
                        <span className="text-navy-500">{l.igstRate}%</span> {formatINR(l.igstAmount)}
                      </>
                    ) : (
                      <>
                        <div>
                          <span className="text-navy-500">{l.cgstRate}%</span> {formatINR(l.cgstAmount)}
                        </div>
                        <div>
                          <span className="text-navy-500">{l.sgstRate}%</span> {formatINR(l.sgstAmount)}
                        </div>
                      </>
                    )}
                  </td>
                )}
                <td className={cn(num, "font-semibold text-navy-950")}>{formatINR(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tax summary & payment | totals */}
      <div className="mt-6 grid gap-8 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-5 text-xs">
          {s.showTax && s.taxSummary.length > 0 && (
            <div>
              <Caption>Tax summary (HSN-wise)</Caption>
              <table className="mt-1.5 border-collapse font-mono text-[11px] tabular">
                <thead>
                  <tr className="border-b border-navy-300 text-[10px] uppercase tracking-[0.06em] text-navy-500">
                    <th className="py-1 pr-5 text-left font-medium">HSN</th>
                    <th className="py-1 pr-5 text-right font-medium">Rate</th>
                    <th className="py-1 pr-5 text-right font-medium">Taxable</th>
                    {inter ? (
                      <th className="py-1 text-right font-medium">IGST</th>
                    ) : (
                      <>
                        <th className="py-1 pr-5 text-right font-medium">CGST</th>
                        <th className="py-1 text-right font-medium">SGST</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="text-navy-800">
                  {s.taxSummary.map((r) => (
                    <tr key={`${r.hsn}-${r.gstRate}`} className="border-b border-navy-100">
                      <td className="py-1 pr-5">{r.hsn ?? "—"}</td>
                      <td className="py-1 pr-5 text-right">{r.gstRate}%</td>
                      <td className="py-1 pr-5 text-right">{formatINR(r.taxableValue)}</td>
                      {inter ? (
                        <td className="py-1 text-right">{formatINR(r.igst)}</td>
                      ) : (
                        <>
                          <td className="py-1 pr-5 text-right">{formatINR(r.cgst)}</td>
                          <td className="py-1 text-right">{formatINR(r.sgst)}</td>
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
              <Caption>{s.docType === "credit_note" ? "Refund" : "Payment"}</Caption>
              <div className="mt-1.5 space-y-0.5 text-navy-700">
                {s.payments.map((p, i) => (
                  <div key={i}>
                    {p.direction === "refund" ? "Refund" : "Received"} · {METHOD[p.method] ?? p.method}
                    {p.reference ? (
                      <>
                        {" "}
                        · Ref <span className="font-mono">{p.reference}</span>
                      </>
                    ) : (
                      ""
                    )}{" "}
                    · <span className="font-mono font-semibold text-navy-950">{formatINR(p.amount)}</span>
                  </div>
                ))}
                <div className="font-semibold text-navy-950">
                  Status: {s.paymentStatus}
                  {Number(s.balanceDue) ? ` · Balance due ${formatINR(s.balanceDue)}` : ""}
                </div>
              </div>
            </div>
          )}
        </div>
        <dl className="text-[13px] sm:min-w-[270px]">
          <Row k="Gross amount" v={formatINR(s.totals.gross)} />
          {Number(s.totals.lineDiscount) > 0 && <Row k="Item discounts" v={`− ${formatINR(s.totals.lineDiscount)}`} />}
          {Number(s.totals.cartDiscount) > 0 && <Row k="Bill discount" v={`− ${formatINR(s.totals.cartDiscount)}`} />}
          {s.showTax && <Row k="Taxable value" v={formatINR(s.totals.taxable)} />}
          {s.showTax && Number(s.totals.cgst) > 0 && <Row k="CGST" v={formatINR(s.totals.cgst)} />}
          {s.showTax && Number(s.totals.sgst) > 0 && <Row k="SGST" v={formatINR(s.totals.sgst)} />}
          {s.showTax && Number(s.totals.igst) > 0 && <Row k="IGST" v={formatINR(s.totals.igst)} />}
          {s.showTax && Number(s.totals.cess) > 0 && <Row k="Cess" v={formatINR(s.totals.cess)} />}
          {Number(s.totals.roundOff) !== 0 && <Row k="Round off" v={formatINR(s.totals.roundOff)} />}
          <div className="mt-2 flex items-baseline justify-between gap-6 border-y-[1.5px] border-navy-950 py-2">
            <dt className="text-[13px] font-semibold uppercase tracking-[0.04em] text-navy-950">{s.docType === "credit_note" ? "Credit total" : "Grand total"}</dt>
            <dd className="headline text-[1.75rem] font-bold text-navy-950 tabular">{formatINR(s.totals.grandTotal)}</dd>
          </div>
          <div className="mt-1.5 max-w-[290px] text-[11px] leading-snug text-navy-600 sm:ml-auto sm:text-right">{s.totals.amountInWords}</div>
        </dl>
      </div>

      <footer className="mt-8 grid gap-6 border-t border-navy-200 pt-4 text-xs sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-3 text-navy-700">
          {s.terms.length > 0 && (
            <div>
              <Caption>Terms</Caption>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed marker:font-mono marker:text-navy-400">
                {s.terms.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ol>
            </div>
          )}
          {s.bankDetails && (
            <div>
              <Caption>Bank details</Caption>
              <div className="mt-1 whitespace-pre-line font-mono text-[11px] leading-relaxed">{s.bankDetails}</div>
            </div>
          )}
          <div className="text-navy-500">Prepared by {s.issuedBy}. Computer-generated document.</div>
          {status === "cancelled" && cancelReason && <div className="font-semibold text-red-700">Cancelled: {cancelReason}</div>}
        </div>
        <div className="self-end text-right">
          <div className="mb-1.5 h-12 w-48 border-b border-navy-400 sm:ml-auto" />
          <div className="font-semibold text-navy-950">{s.signatoryLabel}</div>
        </div>
      </footer>
      {s.footerNote && <p className="mt-6 text-center text-xs font-medium text-gold-700">{s.footerNote}</p>}
    </article>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline py-[3px]">
      <dt className="flex flex-1 items-baseline text-navy-600">
        {k}
        <span aria-hidden className="leader" />
      </dt>
      <dd className="font-mono text-[12.5px] text-navy-950 tabular">{v}</dd>
    </div>
  );
}
