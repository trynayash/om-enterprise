"use client";
import { useEffect, useMemo, useState } from "react";
import { PackageSearch, Search } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { D, formatINR, formatQty } from "@/lib/money";
import { SampleBadge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";
import { cn } from "@/components/ui/cn";
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
      <div className="rounded-2xl border border-navy-100 bg-white p-3 shadow-card sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-navy-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            placeholder="Search name, brand, size or SKU…"
            aria-label="Search products"
            className="h-14 w-full rounded-xl border-2 border-navy-200 bg-navy-50/40 pl-12 pr-12 text-base font-medium focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-100"
          />
          {loading && <Spinner className="absolute right-4 top-1/2 -translate-y-1/2 text-navy-400" />}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip active={!categoryId} onClick={() => setCategoryId("")}>
            All
          </Chip>
          {categories.map((c) => (
            <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(categoryId === c.id ? "" : c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!active ? (
        <EmptyState icon={<PackageSearch className="h-10 w-10" />} title="Look up any price" description="Search or pick a category. Prices shown are the current selling prices — the same ones the bill will use." />
      ) : groups.length === 0 && !loading ? (
        <EmptyState title="No products found" description="Try a brand, size or SKU." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((vs) => {
            const p = vs[0];
            return (
              <article key={p.productId} className="rounded-2xl border border-navy-100 bg-white shadow-card">
                <header className="border-b border-navy-100 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h2 className="font-bold text-navy-900">{p.productName}</h2>
                    {p.isSample && <SampleBadge />}
                  </div>
                  <div className="text-xs text-navy-500">{[p.brandName, p.categoryName, p.hsnCode ? `HSN ${p.hsnCode}` : null, taxCharged ? `GST ${D(p.gstRate).toString()}%` : null].filter(Boolean).join(" · ")}</div>
                </header>
                <ul className="divide-y divide-navy-50">
                  {vs.map((v) => (
                    <li key={v.variantId} className="flex items-start justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-navy-800">{v.variantName}</div>
                        <div className="text-[11px] text-navy-400">{v.sku}</div>
                        {v.tiers.length > 0 && (
                          <div className="text-[11px] font-semibold text-gold-700">
                            Bulk: {v.tiers.map((t) => `${formatQty(t.minQty)}+ @ ${formatINR(t.price)}`).join(" · ")}
                          </div>
                        )}
                        {v.conversions.length > 0 && (
                          <div className="text-[11px] text-navy-500">
                            Also sold by:{" "}
                            {v.conversions
                              .map((c) => `${units.find((u) => u.code === c.unitCode)?.name ?? c.unitCode} (${formatQty(c.factor)} ${v.unitName})`)
                              .join(", ")}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        {v.price ? (
                          <>
                            <div className="text-base font-extrabold text-navy-900 tabular">{formatINR(v.price)}</div>
                            <div className="text-[11px] text-navy-500">
                              per {v.unitName}
                              {taxCharged ? (v.priceIncludesTax ? " · incl. GST" : " · + GST") : ""}
                            </div>
                            {v.mrp && <div className="text-[11px] text-navy-400">MRP {formatINR(v.mrp)}</div>}
                          </>
                        ) : (
                          <span className="text-xs font-semibold text-red-700">No price set</span>
                        )}
                      </div>
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

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("rounded-full px-3 py-1.5 text-xs font-bold transition-colors", active ? "bg-navy-900 text-white" : "bg-navy-50 text-navy-700 hover:bg-navy-100")}
    >
      {children}
    </button>
  );
}
