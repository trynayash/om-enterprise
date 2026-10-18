"use client";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/badge";
import { Alert, Skeleton, td, th } from "@/components/ui/page";
import { DateTime, Money } from "@/components/ui/money";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatINR } from "@/lib/money";

interface PriceHistoryRow {
  id: string;
  listName: string;
  previousPrice: string | null;
  price: string;
  priceIncludesTax: boolean;
  mrp: string | null;
  status: string;
  reason: string;
  effectiveFrom: string;
  createdAt: string;
  createdByName: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  previousMarginPercent: string | null;
  marginPercentSnapshot: string | null;
}
interface CostHistoryRow {
  id: string;
  purchaseCost: string;
  purchaseTaxRate: string;
  freight: string;
  handling: string;
  otherCosts: string;
  itcPolicy: string;
  landedCost: string;
  effectiveFrom: string;
  sourceRef: string | null;
  reason: string;
  createdByName: string;
}

export function HistoryPanel({ variantId, refreshKey }: { variantId: string; refreshKey: string }) {
  const [data, setData] = useState<{ prices: PriceHistoryRow[]; costs: CostHistoryRow[] | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    apiFetch<{ prices: PriceHistoryRow[]; costs: CostHistoryRow[] | null }>(`/api/admin/variants/${variantId}/history`, { signal: ctrl.signal })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) setError(errorMessage(err));
      });
    return () => ctrl.abort();
  }, [variantId, refreshKey]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <Skeleton className="h-40" />;
  const showMargins = data.prices.some((p) => p.marginPercentSnapshot !== null || p.previousMarginPercent !== null);

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-bold text-navy-900">Price history</h3>
        {data.prices.length === 0 ? (
          <p className="text-sm text-navy-500">No prices recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-navy-100">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr>
                  <th className={th}>When</th>
                  <th className={th}>List</th>
                  <th className={`${th} text-right`}>Old → new</th>
                  {showMargins && <th className={`${th} text-right`}>Margin</th>}
                  <th className={th}>Status</th>
                  <th className={th}>By / decided by</th>
                  <th className={th}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {data.prices.map((p) => (
                  <tr key={p.id}>
                    <td className={td}>
                      <DateTime value={p.createdAt} />
                      {new Date(p.effectiveFrom).getTime() - new Date(p.createdAt).getTime() > 120_000 && (
                        <div className="text-xs text-navy-500">
                          effective <DateTime value={p.effectiveFrom} />
                        </div>
                      )}
                    </td>
                    <td className={td}>{p.listName}</td>
                    <td className={`${td} whitespace-nowrap text-right tabular`}>
                      <span className="text-navy-500">{p.previousPrice ? formatINR(p.previousPrice) : "—"}</span> → <b>{formatINR(p.price)}</b>
                      <div className="text-[11px] text-navy-400">
                        {p.priceIncludesTax ? "incl." : "excl."} GST{p.mrp ? ` · MRP ${formatINR(p.mrp)}` : ""}
                      </div>
                    </td>
                    {showMargins && (
                      <td className={`${td} whitespace-nowrap text-right tabular`}>
                        {p.previousMarginPercent ? `${Number(p.previousMarginPercent).toFixed(1)}%` : "—"} → {p.marginPercentSnapshot ? `${Number(p.marginPercentSnapshot).toFixed(1)}%` : "—"}
                      </td>
                    )}
                    <td className={td}>
                      <StatusBadge status={p.status} />
                    </td>
                    <td className={td}>
                      {p.createdByName}
                      {p.decidedByName && p.decidedByName !== p.createdByName && <div className="text-xs text-navy-500">→ {p.decidedByName}</div>}
                    </td>
                    <td className={`${td} max-w-xs text-navy-700`}>
                      {p.reason}
                      {p.decisionNote && <div className="text-xs text-navy-500">Note: {p.decisionNote}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {data.costs && (
        <section>
          <h3 className="mb-2 text-sm font-bold text-navy-900">Cost history</h3>
          {data.costs.length === 0 ? (
            <p className="text-sm text-navy-500">No costs recorded yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-navy-100">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr>
                    <th className={th}>When</th>
                    <th className={`${th} text-right`}>Purchase</th>
                    <th className={`${th} text-right`}>GST</th>
                    <th className={`${th} text-right`}>Freight + handling + other</th>
                    <th className={`${th} text-right`}>Landed</th>
                    <th className={th}>By</th>
                    <th className={th}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {data.costs.map((c) => (
                    <tr key={c.id}>
                      <td className={td}>
                        <DateTime value={c.effectiveFrom} />
                      </td>
                      <td className={`${td} text-right`}>
                        <Money value={c.purchaseCost} />
                      </td>
                      <td className={`${td} text-right tabular`}>
                        {Number(c.purchaseTaxRate)}%<div className="text-[11px] text-navy-400">{c.itcPolicy === "recoverable" ? "ITC claimed" : "in cost"}</div>
                      </td>
                      <td className={`${td} text-right tabular`}>{formatINR(Number(c.freight) + Number(c.handling) + Number(c.otherCosts))}</td>
                      <td className={`${td} text-right font-semibold`}>
                        <Money value={c.landedCost} />
                      </td>
                      <td className={td}>{c.createdByName}</td>
                      <td className={`${td} max-w-xs text-navy-700`}>
                        {c.reason}
                        {c.sourceRef && <div className="text-xs text-navy-500">Ref {c.sourceRef}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
