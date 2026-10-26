import { Suspense } from "react";
import Link from "next/link";
import { requirePageActor } from "@/server/auth/session";
import { can, canAny } from "@/server/auth/actor";
import { countPendingPriceChanges, searchPendingPriceChanges } from "@/server/services/pricing";
import { listCategories } from "@/server/services/catalog";
import { priceChangeReport, productsNeedingReview } from "@/server/services/reports";
import { getSettings } from "@/server/settings";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader, PageSkeleton } from "@/components/ui/page";
import { istStartOfDay } from "@/lib/india";
import { NeedsReviewList, PendingPriceChanges } from "@/components/dashboard/catalog/pricing-review";
import { Pagination } from "@/components/dashboard/ops/pagination";
import { num, type SearchParams } from "@/components/dashboard/ops/params";
import { PriceChangesTable } from "@/components/dashboard/price-changes-table";
import { PendingPriceFilters } from "@/components/dashboard/catalog/pending-price-filters";
import { BulkPriceDecision } from "@/components/dashboard/catalog/bulk-price-decision";
import { isFiltered, parsePendingPriceFilter } from "@/lib/price-filters";

export const metadata = { title: "Price review" };

/** Price changes shown per page; the research notes behind a price can run to a paragraph each. */
const CHANGES_PAGE = 50;
/** Prices waiting for approval shown per page (an imported price list can bring a thousand at once). */
const WAITING_PAGE = 25;

export default function PricingPage({ searchParams }: PageProps<"/dashboard/pricing">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PricingContent searchParams={searchParams} />
    </Suspense>
  );
}

async function PricingContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePageActor(["prices.edit", "prices.approve", "costs.view"]);
  const sp = await searchParams;
  const showCost = can(actor, "costs.view");
  const pricing = await getSettings("pricing");
  const review = canAny(actor, ["catalog.view", "prices.edit", "reports.view"]) ? await productsNeedingReview(actor) : [];
  const seesPending = canAny(actor, ["prices.edit", "prices.approve"]);
  const filter = parsePendingPriceFilter(sp);
  const waitingAll = seesPending ? await countPendingPriceChanges() : 0;
  const pending = seesPending && waitingAll ? await searchPendingPriceChanges(actor, filter, { page: num(sp, "waiting", 1), pageSize: WAITING_PAGE }) : null;
  const cats = pending ? await listCategories() : [];
  const to = new Date(istStartOfDay(new Date()).getTime() + 86400_000);
  const from = new Date(to.getTime() - 30 * 86400_000);
  const recent = canAny(actor, ["reports.view", "prices.edit"]) ? await priceChangeReport(actor, { from, to }) : [];
  const pages = Math.max(1, Math.ceil(recent.length / CHANGES_PAGE));
  const page = Math.min(num(sp, "page", 1), pages);
  const shown = recent.slice((page - 1) * CHANGES_PAGE, page * CHANGES_PAGE);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalogue"
        title="Price review"
        description={`Variants that need a price, a cost, or a look at their margin — plus price changes waiting for approval. Prices older than ${pricing.reviewAfterDays} days are flagged for a fresh review.`}
      />

      <Card>
        <div id="waiting" className="scroll-mt-6">
          <CardHeader
            title={`Waiting for approval (${waitingAll.toLocaleString("en-IN")})`}
            description="Price changes proposed by admins or brought in with a price list. They take effect only after approval."
          />
        </div>
        {pending ? (
          <>
            <CardBody className="space-y-3 border-b border-navy-100">
              <PendingPriceFilters inset brands={pending.brandOptions} categories={cats.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, sortOrder: c.sortOrder, isActive: c.isActive }))} pageParam="waiting" />
              <BulkPriceDecision
                total={pending.total}
                from={(pending.page - 1) * pending.pageSize + 1}
                to={(pending.page - 1) * pending.pageSize + pending.items.length}
                canApprove={can(actor, "prices.approve")}
                filter={filter}
                filtered={isFiltered(filter)}
                asOf={pending.asOf.toISOString()}
                summary={pending.summary}
              />
            </CardBody>
            <PendingPriceChanges
              canApprove={can(actor, "prices.approve")}
              showCost={showCost}
              items={pending.items.map((p) => ({
                id: p.version.id,
                productId: p.productId,
                productName: p.productName,
                variantName: p.variantName,
                sku: p.sku,
                listName: p.listName,
                previousPrice: p.version.previousPrice,
                price: p.version.price,
                priceIncludesTax: p.version.priceIncludesTax,
                priceInclGst: p.priceInclGst,
                changePct: p.changePct,
                brandName: p.brandName,
                categoryName: p.categoryName,
                source: p.source,
                effectiveFrom: p.version.effectiveFrom.toISOString(),
                createdAt: p.version.createdAt.toISOString(),
                requestedBy: p.requestedBy,
                reason: p.version.reason,
                marginPercent: showCost ? p.version.marginPercentSnapshot : null,
                previousMarginPercent: showCost ? p.version.previousMarginPercent : null,
              }))}
            />
            {pending.total > WAITING_PAGE && (
              <div className="px-5 pb-4">
                <Pagination total={pending.total} page={pending.page} pageSize={WAITING_PAGE} sp={sp} basePath="/dashboard/pricing" param="waiting" anchor="waiting" />
              </div>
            )}
          </>
        ) : (
          <CardBody>
            <p className="text-sm text-navy-500">No price changes are waiting for approval.</p>
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader title="Needs attention" description="Active variants with a missing price or cost, a thin or negative margin, or a stale price." />
        <CardBody>
          <NeedsReviewList items={review} showCost={showCost} canImport={can(actor, "catalog.import")} />
        </CardBody>
      </Card>

      <Card>
        <div id="price-changes" className="scroll-mt-6">
          <CardHeader
            title="Price changes — last 30 days"
            description={`Every proposed, approved, rejected or cancelled price version, newest first${recent.length ? ` · ${recent.length.toLocaleString("en-IN")} in all` : ""}.`}
          />
        </div>
        {recent.length === 0 ? (
          <CardBody>
            <p className="text-sm text-navy-500">No price changes in the last 30 days.</p>
          </CardBody>
        ) : (
          <>
            <div className="overflow-x-auto">
              <PriceChangesTable rows={shown} showCost={showCost} />
            </div>
            <div className="px-5 pb-4">
              <Pagination total={recent.length} page={page} pageSize={CHANGES_PAGE} sp={sp} basePath="/dashboard/pricing" anchor="price-changes" />
            </div>
          </>
        )}
      </Card>
      <p className="text-xs leading-relaxed text-navy-500">
        Margins are gross margins on the tax-exclusive selling price (profit ÷ price). Markup (profit ÷ cost) is shown inside each product. Manage prices from the{" "}
        <Link href="/dashboard/products" className="font-semibold text-gold-700 hover:underline">
          product pages
        </Link>
        .
      </p>
    </div>
  );
}
