import { api } from "@/server/http";
import { requirePermission } from "@/server/auth/actor";
import { notFound } from "@/server/errors";
import { periodFromQuery } from "@/server/route-helpers";
import * as reports from "@/server/services/reports";

const REPORTS = {
  summary: reports.salesSummary,
  "sales-by-day": reports.salesByDay,
  products: reports.productPerformance,
  categories: reports.categoryRevenue,
  staff: reports.staffSales,
  discounts: reports.discountReport,
  "below-cost": reports.belowCostSales,
  payments: reports.paymentSummary,
  "price-changes": reports.priceChangeReport,
  "needs-review": (actor: Parameters<typeof reports.productsNeedingReview>[0]) => reports.productsNeedingReview(actor),
  profit: reports.grossProfit,
} as const;

function rowsOf(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    for (const k of ["bills", "byMethod", "items"]) if (Array.isArray(d[k])) return d[k] as Record<string, unknown>[];
    return [d];
  }
  return [];
}

export const GET = api({ permission: ["reports.view", "payments.view", "prices.edit"] }, async ({ actor, params, query }) => {
  const name = params.name.replace(/\.csv$/, "") as keyof typeof REPORTS;
  const fn = REPORTS[name];
  if (!fn) throw notFound("Report");
  const period = periodFromQuery(query);
  const data = await (fn as (a: typeof actor, p: typeof period) => Promise<unknown>)(actor, period);
  if (params.name.endsWith(".csv") || query.get("format") === "csv") {
    requirePermission(actor, "reports.export");
    const csv = reports.toCsv(rowsOf(data));
    return new Response(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="om-${name}-${period.from.toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return data;
});
