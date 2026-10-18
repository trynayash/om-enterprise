import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, BadgeCheck, Tag } from "lucide-react";
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
        title="Approvals"
        description={
          canDiscounts
            ? `Discounts above a cashier's limit and price changes wait here. You can approve discounts up to ${actor.approvalLimitPercent}%${mayBelowCost ? ", including sales below cost" : ""}.`
            : "Price changes proposed by staff wait here for your decision."
        }
      />

      {canDiscounts && (
        <section aria-labelledby="disc-h" className="space-y-4">
          <h2 id="disc-h" className="flex items-center gap-2 text-lg font-bold">
            <BadgeCheck className="h-5 w-5 text-gold-600" /> Discount approvals
            <Badge tone={discounts.length ? "gold" : "neutral"}>{discounts.length}</Badge>
          </h2>
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
                        {d.maxDiscountPercent}% discount on{" "}
                        <Link href={`/dashboard/sales/${a.saleId}`} className="underline-offset-2 hover:underline">
                          {saleNumber}
                        </Link>
                        <StatusBadge status={saleStatus} />
                      </span>
                    }
                    description={
                      <>
                        Requested by <strong>{requestedByName}</strong>
                        {d.requesterLimitPercent ? ` (limit ${d.requesterLimitPercent}%)` : ""} · <DateTime value={a.requestedAt} />
                      </>
                    }
                    actions={<div className="text-right text-sm"><div className="text-navy-500">Bill total</div><div className="text-lg font-extrabold tabular">{formatINR(d.grandTotal)}</div></div>}
                  />
                  <CardBody className="space-y-4">
                    <p className="rounded-xl bg-navy-50 px-3 py-2 text-sm">
                      <span className="font-semibold">Reason:</span> “{a.reason}”
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
                    <div className="overflow-x-auto rounded-xl border border-navy-100">
                      <table className="w-full min-w-[620px] text-sm">
                        <thead>
                          <tr className="bg-navy-50/70 text-left text-xs uppercase tracking-wide text-navy-600">
                            <th className="px-3 py-2">Item</th>
                            <th className="px-3 py-2 text-right">Qty</th>
                            <th className="px-3 py-2 text-right">List price</th>
                            <th className="px-3 py-2 text-right">Charged</th>
                            <th className="px-3 py-2 text-right">Line net</th>
                            <th className="px-3 py-2 text-right">Discount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.lines.map((l, i) => (
                            <tr key={`${l.sku}-${i}`} className="border-t border-navy-50 align-top">
                              <td className="px-3 py-2">
                                <div className="font-medium">{l.name}</div>
                                <div className="text-xs text-navy-500">{l.sku}</div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {l.overrideReason && <Badge tone="amber">Price changed: {l.overrideReason}</Badge>}
                                  {l.discountReason && <Badge tone="gold">{l.discountReason}</Badge>}
                                  {l.belowCost && <Badge tone="red">Below cost</Badge>}
                                  {!l.belowCost && l.belowMarginFloor && <Badge tone="amber">Below margin floor</Badge>}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Qty value={l.quantity} unit={l.unit} />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Money value={l.listUnitPrice} />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Money value={l.unitPrice} />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Money value={l.netAmount} />
                              </td>
                              <td className={`px-3 py-2 text-right font-semibold tabular ${D(l.discountPercent).greaterThan(0) ? "text-amber-700" : "text-navy-400"}`}>{l.discountPercent}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2 text-sm text-navy-600">
                      <span>
                        List value <Money value={d.listTotal} /> → bill <Money value={d.grandTotal} className="font-semibold text-navy-900" /> (overall {d.effectiveDiscountPercent}% off)
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
          <h2 id="price-h" className="flex items-center gap-2 text-lg font-bold">
            <Tag className="h-5 w-5 text-gold-600" /> Price changes
            <Badge tone={prices.length ? "gold" : "neutral"}>{prices.length}</Badge>
          </h2>
          {prices.length === 0 ? (
            <EmptyState title="No price changes waiting" description="Price changes proposed by admins without approval rights appear here before they take effect." />
          ) : (
            prices.map((p) => {
              const v = p.version;
              const change = v.previousPrice && D(v.previousPrice).greaterThan(0) ? D(v.price).minus(D(v.previousPrice)).div(D(v.previousPrice)).times(100) : null;
              return (
                <Card key={v.id}>
                  <CardBody className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Link href={`/dashboard/products/${p.productId}`} className="font-bold text-navy-900 hover:underline">
                          {p.productName} — {p.variantName}
                        </Link>
                        <div className="text-xs text-navy-500">
                          {p.sku} · {p.listName} list · proposed by {p.requestedBy} · <DateTime value={v.createdAt} />
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-baseline justify-end gap-2 tabular">
                          <span className="text-navy-400 line-through">{v.previousPrice ? formatINR(v.previousPrice) : "no price"}</span>
                          <span className="text-xl font-extrabold">{formatINR(v.price)}</span>
                        </div>
                        <div className="text-xs text-navy-500">
                          {v.priceIncludesTax ? "incl. GST" : "excl. GST"}
                          {change && <span className={change.isNegative() ? " text-red-700" : " text-emerald-700"}> · {change.isNegative() ? "" : "+"}{change.toFixed(1)}%</span>}
                          {v.mrp && <> · MRP {formatINR(v.mrp)}</>}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm">
                      <span className="rounded-xl bg-navy-50 px-3 py-1.5">
                        <span className="font-semibold">Reason:</span> “{v.reason}”
                      </span>
                      <span className="rounded-xl bg-navy-50 px-3 py-1.5">
                        Effective <DateTime value={v.effectiveFrom} />
                      </span>
                      {showCost && (
                        <span className="rounded-xl bg-navy-50 px-3 py-1.5">
                          Margin {v.previousMarginPercent ? `${v.previousMarginPercent}%` : "—"} → <strong>{v.marginPercentSnapshot ? `${v.marginPercentSnapshot}%` : "cost unknown"}</strong>
                        </span>
                      )}
                      {v.tiers.length > 0 && <span className="rounded-xl bg-navy-50 px-3 py-1.5">{v.tiers.length} quantity price(s)</span>}
                    </div>
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
