import { Suspense } from "react";
import Link from "next/link";
import { requirePageActor } from "@/server/auth/session";
import { can, canAny, type Actor } from "@/server/auth/actor";
import { listPendingPriceChanges } from "@/server/services/pricing";
import { priceChangeReport, productsNeedingReview } from "@/server/services/reports";
import { getSettings } from "@/server/settings";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader, PageSkeleton, td, th } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/badge";
import { DateTime } from "@/components/ui/money";
import { cn } from "@/components/ui/cn";
import { formatINR } from "@/lib/money";
import { istStartOfDay } from "@/lib/india";
import { NeedsReviewList, PendingPriceChanges } from "@/components/dashboard/catalog/pricing-review";

export const metadata = { title: "Price review" };

export default function PricingPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PricingContent />
    </Suspense>
  );
}

async function PricingContent() {
  const actor = await requirePageActor(["prices.edit", "prices.approve", "costs.view"]);
  const showCost = can(actor, "costs.view");
  const pricing = await getSettings("pricing");
  const review = canAny(actor, ["catalog.view", "prices.edit", "reports.view"]) ? await productsNeedingReview(actor) : [];
  // Typed loosely so this works whether or not the service takes the actor (for redaction).
  const pendingFor: (a: Actor) => ReturnType<typeof listPendingPriceChanges> = listPendingPriceChanges;
  const pending = canAny(actor, ["prices.edit", "prices.approve"]) ? await pendingFor(actor) : [];
  const to = new Date(istStartOfDay(new Date()).getTime() + 86400_000);
  const from = new Date(to.getTime() - 30 * 86400_000);
  const recent = canAny(actor, ["reports.view", "prices.edit"]) ? await priceChangeReport(actor, { from, to }) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pricing"
        title="Price review"
        description={`Variants that need a price, a cost, or a look at their margin — plus price changes waiting for approval. Prices older than ${pricing.reviewAfterDays} days are flagged for a fresh review.`}
      />

      <Card>
        <CardHeader title={`Waiting for approval (${pending.length})`} description="Price changes proposed by admins. They take effect only after approval." />
        <CardBody>
          <PendingPriceChanges
            canApprove={can(actor, "prices.approve")}
            showCost={showCost}
            items={pending.map((p) => ({
              id: p.version.id,
              productId: p.productId,
              productName: p.productName,
              variantName: p.variantName,
              sku: p.sku,
              listName: p.listName,
              previousPrice: p.version.previousPrice,
              price: p.version.price,
              priceIncludesTax: p.version.priceIncludesTax,
              effectiveFrom: p.version.effectiveFrom.toISOString(),
              createdAt: p.version.createdAt.toISOString(),
              requestedBy: p.requestedBy,
              reason: p.version.reason,
              marginPercent: showCost ? p.version.marginPercentSnapshot : null,
              previousMarginPercent: showCost ? p.version.previousMarginPercent : null,
            }))}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Needs attention" description="Active variants with a missing price or cost, a thin or negative margin, or a stale price." />
        <CardBody>
          <NeedsReviewList items={review} showCost={showCost} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Price changes — last 30 days" description="Every proposed, approved, rejected or cancelled price version." />
        {recent.length === 0 ? (
          <CardBody>
            <p className="text-sm text-navy-500">No price changes in the last 30 days.</p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px]">
              <thead>
                <tr>
                  <th className={th}>When</th>
                  <th className={th}>Variant</th>
                  <th className={th}>List</th>
                  <th className={`${th} text-right`}>Old → new</th>
                  <th className={`${th} text-right`}>Change</th>
                  {showCost && <th className={`${th} text-right`}>Margin</th>}
                  <th className={th}>Status</th>
                  <th className={th}>By</th>
                  <th className={th}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className={td}>
                      <DateTime value={r.created_at} />
                    </td>
                    <td className={`${td} min-w-56`}>
                      <div className="font-medium">{r.product}</div>
                      <div className="font-mono text-xs text-navy-500">{r.sku}</div>
                    </td>
                    <td className={td}>{r.list_name}</td>
                    <td className={`${td} whitespace-nowrap text-right tabular`}>
                      <span className="text-navy-500">{r.previous_price ? formatINR(r.previous_price) : "—"}</span> → <b>{formatINR(r.price)}</b>
                    </td>
                    <td className={cn(td, "text-right tabular font-semibold", r.changePercent && Number(r.changePercent) < 0 ? "text-red-700" : "text-emerald-700")}>
                      {r.changePercent ? `${Number(r.changePercent) > 0 ? "+" : ""}${Number(r.changePercent).toFixed(1)}%` : "new"}
                    </td>
                    {showCost && (
                      <td className={`${td} whitespace-nowrap text-right tabular`}>
                        {r.previous_margin || r.new_margin
                          ? `${r.previous_margin ? `${Number(r.previous_margin).toFixed(1)}%` : "—"} → ${r.new_margin ? `${Number(r.new_margin).toFixed(1)}%` : "—"}`
                          : "—"}
                      </td>
                    )}
                    <td className={td}>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      {r.created_by}
                      {r.decided_by && r.decided_by !== r.created_by && <div className="text-xs text-navy-500">→ {r.decided_by}</div>}
                    </td>
                    <td className={`${td} max-w-xs text-navy-700`}>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-navy-500">
        Margins are gross margins on the tax-exclusive selling price (profit ÷ price). Markup (profit ÷ cost) is shown inside each product. Manage prices from the{" "}
        <Link href="/dashboard/products" className="font-semibold text-gold-700 hover:underline">
          product pages
        </Link>
        .
      </p>
    </div>
  );
}
