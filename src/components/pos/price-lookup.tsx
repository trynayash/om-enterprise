"use client";
import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { D, formatINR, formatQty } from "@/lib/money";
import { SampleBadge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";
import { cn } from "@/components/ui/cn";
import { optionLabel } from "@/lib/line-description";
import type { PosUnit, SearchResult } from "./types";

/** Price lookup for the counter (selling prices only — never cost). */
export function PriceLookup({ categories, units, taxCharged }: { categories: { id: string; name: string }[]; units: PosUnit[]; taxCharged: boolean }) {
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [rows, setRows] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!q.trim() && !categoryId) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ limit: "100" });
        if (q.trim()) qs.set("q", q.trim());
        if (categoryId) qs.set("categoryId", categoryId);
        setRows(await apiFetch<SearchResult[]>(`/api/pos/search?${qs}`, { signal: ctrl.signal }));
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, categoryId]);

  const groups = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    for (const r of rows) map.set(r.productId, [...(map.get(r.productId) ?? []), r]);
    return [...map.values()];
  }, [rows]);
  const active = q.trim() || categoryId;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-navy-200 bg-white p-3 shadow-card sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-navy-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            placeholder="Search name, brand, size or SKU…"
            aria-label="Search products"
            className="h-14 w-full rounded-lg border border-navy-200 bg-white pl-12 pr-12 text-[17px] text-navy-950 placeholder:text-navy-400 transition-[border-color,box-shadow] duration-150 hover:border-navy-300 focus:border-navy-800 focus:outline-none focus:ring-[3px] focus:ring-gold-300/45"
          />
          {loading && <Spinner className="absolute right-4 top-1/2 -translate-y-1/2 text-navy-400" />}
        </div>
        {/* No chip is pressed until one is chosen: the list starts empty, so an "All" that looked selected would mislead. */}
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Category">
          {categories.map((c) => (
            <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(categoryId === c.id ? "" : c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!active ? (
        <EmptyState title="Look up any price" description="Search by name, brand, size or SKU, or pick a category above. Prices shown are the current selling prices — the same ones the bill will use." />
      ) : groups.length === 0 && !loading ? (
        <EmptyState title="No products found" description="Try a brand, size or SKU." />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {groups.map((vs) => {
            const p = vs[0];
            return (
              <article key={p.productId} className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-card">
                <header className="border-b border-navy-200 bg-paper/60 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h2 className="font-semibold text-navy-950">{p.productName}</h2>
                    {p.isSample && <SampleBadge />}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-navy-500">
                    {[p.brandName, p.categoryName].filter(Boolean).map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                    {p.hsnCode && <span className="font-mono">HSN {p.hsnCode}</span>}
                    {taxCharged && <span className="font-mono">GST {D(p.gstRate).toString()}%</span>}
                  </div>
                </header>
                <ul className="divide-y divide-navy-100">
                  {vs.map((v) => (
                    <li key={v.variantId} className="px-4 py-2.5">
                      <div className="flex items-baseline justify-between gap-4">
                        {/* A product sold in one form has a "Standard" placeholder option: its SKU names the row instead. */}
                        {optionLabel(v.variantName) ? (
                          <span className="min-w-0 text-sm font-medium text-navy-900">{v.variantName}</span>
                        ) : (
                          <span className="min-w-0 font-mono text-[13px] text-navy-700">{v.sku}</span>
                        )}
                        {v.price ? (
                          <span className="shrink-0 font-mono text-[15px] font-semibold text-navy-950 tabular">{formatINR(v.price)}</span>
                        ) : (
                          <span className="shrink-0 text-xs font-semibold text-red-700">No price set</span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-[11px]">
                        <span className="font-mono text-navy-500">{optionLabel(v.variantName) ? v.sku : ""}</span>
                        {v.price && (
                          <span className="text-navy-500">
                            per {v.unitName}
                            {taxCharged ? (v.priceIncludesTax ? " · incl. GST" : " · + GST") : ""}
                            {v.mrp && <span className="ml-2 font-mono text-navy-400">MRP {formatINR(v.mrp)}</span>}
                          </span>
                        )}
                      </div>
                      {v.tiers.length > 0 && (
                        <div className="mt-1 text-[11px] font-medium text-gold-700">
                          Bulk: <span className="font-mono">{v.tiers.map((t) => `${formatQty(t.minQty)}+ @ ${formatINR(t.price)}`).join(" · ")}</span>
                        </div>
                      )}
                      {v.conversions.length > 0 && (
                        <div className="mt-0.5 text-[11px] text-navy-500">
                          Also sold by:{" "}
                          {v.conversions
                            .map((c) => `${units.find((u) => u.code === c.unitCode)?.name ?? c.unitCode} (${formatQty(c.factor)} ${v.unitName})`)
                            .join(", ")}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A category filter; the chosen one shows a cross, and tapping it again clears the filter. */
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-[13px] font-medium transition-colors duration-150",
        active ? "border-navy-900 bg-navy-900 pr-2 text-white" : "border-navy-200 bg-white text-navy-700 hover:border-navy-400 hover:text-navy-950",
      )}
    >
      {children}
      {active && <X className="h-3.5 w-3.5 opacity-70" aria-hidden />}
    </button>
  );
}
