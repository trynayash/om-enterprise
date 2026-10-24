import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { listPendingApprovals } from "@/server/services/sales";
import { listPendingPriceChanges } from "@/server/services/pricing";
import { D, formatINR } from "@/lib/money";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader, PageSkeleton } from "@/components/ui/page";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { DateTime, Money, Qty } from "@/components/ui/money";
import { DecisionButtons } from "@/components/dashboard/ops/decision-buttons";
import { TitleStamps } from "@/components/dashboard/title-stamps";
import { tdNum, tdText, th, thNum, withPy } from "@/components/dashboard/table";
import { lineDescription } from "@/lib/line-description";

function SectionHeading({ id, title, count }: { id: string; title: string; count: number }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-navy-200 pb-2.5">
      <h2 id={id} className="text-lg font-semibold tracking-[-0.01em] text-navy-950">
        {title}
      </h2>
      <span className={`font-mono text-[13px] tabular ${count ? "font-semibold text-gold-700" : "text-navy-400"}`}>{count}</span>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="label-mono text-[10px] text-navy-500">{label}</dt>
      <dd className="mt-1 text-sm text-navy-900">{children}</dd>
    </div>
  );
}

export const metadata = { title: "Approvals" };

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Approvals />
    </Suspense>
  );
}

interface ApprovalDetails {
  saleNumber: string;
  grandTotal: string;
  listTotal: string;
  effectiveDiscountPercent: string;
  maxDiscountPercent: string;
  anyBelowCost: boolean;
  anyBelowMarginFloor: boolean;
  reasons?: string[];
  requesterLimitPercent?: string;
  cartDiscount: { type: "percent" | "amount"; value: string; reason: string | null } | null;
  lines: {
    sku: string | null;
    name: string;
    quantity: string;
    unit: string;
    listUnitPrice: string;
    unitPrice: string;
    netAmount: string;
    discountPercent: string;
    priceSource: string;
    overrideReason: string | null;
    discountReason: string | null;
    belowCost: boolean;
    belowMarginFloor: boolean;
  }[];
}

async function Approvals() {
  const actor = await requirePageActor(["discounts.approve", "prices.approve"]);
  const canDiscounts = can(actor, "discounts.approve");
  const canPrices = can(actor, "prices.approve");
  const discounts = canDiscounts ? await listPendingApprovals(actor) : [];
  const prices = canPrices ? await listPendingPriceChanges(actor) : [];
  const showCost = can(actor, "costs.view");
  const mayBelowCost = can(actor, "pricing.sell_below_cost");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Sales"
        title="Approvals"
        description={
          canDiscounts
            ? `Discounts above a cashier's limit and price changes wait here. You can approve discounts up to ${actor.approvalLimitPercent}%${mayBelowCost ? ", including sales below cost" : ""}.`
            : "Price changes proposed by staff wait here for your decision."
        }
      />

      {canDiscounts && (
        <section aria-labelledby="disc-h" className="space-y-4">
          <SectionHeading id="disc-h" title="Discount approvals" count={discounts.length} />
          {discounts.length === 0 ? (
            <EmptyState title="No discount approvals waiting" description="When a cashier asks for a discount above their limit, it appears here. Approvals can also be given in person at the counter." />
          ) : (
            discounts.map(({ a, requestedByName, saleNumber, saleStatus }) => {
              const d = a.details as ApprovalDetails;
              const overLimit = !actor.isSuperAdmin && D(d.maxDiscountPercent).greaterThan(D(actor.approvalLimitPercent));
              const needsBelowCost = (d.anyBelowCost || d.anyBelowMarginFloor) && !mayBelowCost;
              return (
                <Card key={a.id}>
                  <CardHeader
                    title={
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono">{d.maxDiscountPercent}%</span> discount on{" "}
                        <Link href={`/dashboard/sales/${a.saleId}`} className="font-mono underline-offset-[3px] hover:underline">
                          {saleNumber}
                        </Link>
                        <TitleStamps>
                          <StatusBadge status={saleStatus} />
                        </TitleStamps>
                      </span>
                    }
                    description={
                      <>
                        Requested by <strong>{requestedByName}</strong>
                        {d.requesterLimitPercent ? ` (limit ${d.requesterLimitPercent}%)` : ""} · <DateTime value={a.requestedAt} />
                      </>
                    }
                    actions={
                      <div className="text-right">
                        <div className="label-mono text-[10px] text-navy-500">Bill total</div>
                        <div className="mt-1 font-mono text-lg font-semibold tabular">{formatINR(d.grandTotal)}</div>
                      </div>
                    }
                  />
                  <CardBody className="space-y-4">
                    <p className="border-l-2 border-gold-500 pl-3 text-sm leading-relaxed text-navy-800">
                      <span className="label-mono mr-2 text-[10px] text-navy-500">Reason</span>“{a.reason}”
                    </p>
                    {d.reasons?.length ? (
                      <ul className="flex flex-wrap gap-2">
                        {d.reasons.map((r) => (
                          <li key={r}>
                            <Badge tone={/cost|margin/i.test(r) ? "red" : "amber"} className="whitespace-normal">{r.replace("your limit", "the requester's limit")}</Badge>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="overflow-x-auto rounded-lg border border-navy-100">
                      <table className="w-full min-w-[620px]">
                        <thead>
                          <tr>
                            <th className={th}>Item</th>
                            <th className={thNum}>Qty</th>
                            <th className={thNum}>List price</th>
                            <th className={thNum}>Charged</th>
                            <th className={thNum}>Line net</th>
                            <th className={thNum}>Discount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.lines.map((l, i) => (
                            <tr key={`${l.sku}-${i}`}>
                              <td className={withPy(tdText, "py-2.5")}>
                                <div className="font-medium">{l.name}</div>
                                <div className="font-mono text-[11.5px] text-navy-500">{l.sku}</div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {l.overrideReason && <Badge tone="amber">Price changed: {l.overrideReason}</Badge>}
                                  {l.discountReason && <Badge tone="gold">{l.discountReason}</Badge>}
                                  {l.belowCost && <Badge tone="red">Below cost</Badge>}
                                  {!l.belowCost && l.belowMarginFloor && <Badge tone="amber">Below margin floor</Badge>}
                                </div>
                              </td>
                              <td className={withPy(tdNum, "py-2.5")}>
                                <Qty value={l.quantity} unit={l.unit} />
                              </td>
                              <td className={withPy(tdNum, "py-2.5")}>
                                <Money value={l.listUnitPrice} />
                              </td>
                              <td className={withPy(tdNum, "py-2.5")}>
                                <Money value={l.unitPrice} />
                              </td>
                              <td className={withPy(tdNum, "py-2.5")}>
                                <Money value={l.netAmount} />
                              </td>
                              <td className={`${withPy(tdNum, "py-2.5")} font-semibold`}>
                                <span className={D(l.discountPercent).greaterThan(0) ? "text-amber-700" : "text-navy-400"}>{l.discountPercent}%</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2 text-sm text-navy-600">
                      <span>
                        List value <Money value={d.listTotal} className="font-mono text-[13px]" /> → bill <Money value={d.grandTotal} className="font-mono text-[13px] font-semibold text-navy-900" /> (overall{" "}
                        <span className="font-mono text-[13px]">{d.effectiveDiscountPercent}%</span> off)
                      </span>
                      {d.cartDiscount && (
                        <span>
                          Bill discount: {d.cartDiscount.type === "percent" ? `${d.cartDiscount.value}%` : formatINR(d.cartDiscount.value)}
                          {d.cartDiscount.reason ? ` — ${d.cartDiscount.reason}` : ""}
                        </span>
                      )}
                    </div>
                    {(overLimit || needsBelowCost) && (
                      <Alert tone="warning" title="You may not be able to approve this">
                        {overLimit && <>This discount is above your approval limit of {actor.approvalLimitPercent}%. </>}
                        {needsBelowCost && <>Selling below cost / margin floor needs an approver allowed to do so. </>}
                        You can still reject it, or ask the Super Admin.
                      </Alert>
                    )}
                    <DecisionButtons path={`/api/approvals/${a.id}`} subject={`${d.maxDiscountPercent}% discount on ${saleNumber}`} />
                    <p className="flex items-start gap-1.5 text-xs text-navy-500">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      This approval is tied to this exact cart. If the cashier changes it afterwards, a new approval is needed.
                    </p>
                  </CardBody>
                </Card>
              );
            })
          )}
        </section>
      )}

      {canPrices && (
        <section aria-labelledby="price-h" className="space-y-4">
          <SectionHeading id="price-h" title="Price changes" count={prices.length} />
          {prices.length === 0 ? (
            <EmptyState title="No price changes waiting" description="Price changes proposed by admins without approval rights appear here before they take effect." />
          ) : (
            prices.map((p) => {
              const v = p.version;
              const change = v.previousPrice && D(v.previousPrice).greaterThan(0) ? D(v.price).minus(D(v.previousPrice)).div(D(v.previousPrice)).times(100) : null;
              return (
                <Card key={v.id}>
                  <CardBody className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/dashboard/products/${p.productId}`} className="font-semibold text-navy-900 underline-offset-[3px] hover:underline">
                          {lineDescription(null, p.productName, p.variantName)}
                        </Link>
                        <div className="mt-0.5 text-xs text-navy-500">
                          <span className="font-mono text-[11.5px] text-navy-600">{p.sku}</span> · {p.listName} list · proposed by {p.requestedBy} · <DateTime value={v.createdAt} />
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-baseline justify-end gap-2.5 font-mono tabular">
                          {v.previousPrice ? (
                            <span className="text-[13px] text-navy-400 line-through">{formatINR(v.previousPrice)}</span>
                          ) : (
                            <span className="font-sans text-xs text-navy-400">no price yet</span>
                          )}
                          <span className="text-xl font-semibold text-navy-950">{formatINR(v.price)}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-navy-500">
                          {v.priceIncludesTax ? "incl. GST" : "excl. GST"}
                          {change && <span className={change.isNegative() ? " text-red-700" : " text-emerald-700"}> · {change.isNegative() ? "" : "+"}{change.toFixed(1)}%</span>}
                          {v.mrp && <> · MRP {formatINR(v.mrp)}</>}
                        </div>
                      </div>
                    </div>
                    <dl className="grid gap-x-6 gap-y-3 border-y border-navy-100 py-3 sm:grid-cols-[minmax(0,2fr)_auto_auto_auto]">
                      <Fact label="Reason">“{v.reason}”</Fact>
                      <Fact label="Effective">
                        <DateTime value={v.effectiveFrom} />
                      </Fact>
                      {showCost && (
                        <Fact label="Margin">
                          <span className="font-mono text-[13px]">
                            {v.previousMarginPercent ? `${v.previousMarginPercent}%` : "—"} → <strong>{v.marginPercentSnapshot ? `${v.marginPercentSnapshot}%` : "cost unknown"}</strong>
                          </span>
                        </Fact>
                      )}
                      {v.tiers.length > 0 && <Fact label="Quantity prices">{v.tiers.length} quantity price(s)</Fact>}
                    </dl>
                    <DecisionButtons path={`/api/admin/prices/${v.id}/decision`} subject={`price for ${p.sku}`} />
                  </CardBody>
                </Card>
              );
            })
          )}
        </section>
      )}
    </div>
  );
}
