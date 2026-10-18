"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, PackagePlus, Plus, ScanLine, Search, X } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { D, formatINR, formatQty } from "@/lib/money";
import { Button, Spinner } from "@/components/ui/button";
import { SampleBadge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import type { PosUnit, SearchResult } from "./types";

interface Props {
  saleId: string;
  priceListId: string;
  units: PosUnit[];
  taxCharged: boolean;
  onAdded: (label: string) => Promise<void> | void;
  onError: (message: string) => void;
}

function priceLabel(r: SearchResult, taxCharged: boolean) {
  if (!r.price) return null;
  return `${formatINR(r.price)}${taxCharged ? (r.priceIncludesTax ? " incl. GST" : " + GST") : ""}`;
}

function findExact(rows: SearchResult[], term: string) {
  const t = term.toUpperCase();
  return rows.find((r) => r.sku.toUpperCase() === t || (r.barcode && r.barcode.toUpperCase() === t));
}

/** Product finder for the cart. "/" focuses it; Enter on an exact SKU/barcode adds one unit instantly. */
export function ProductSearch({ saleId, priceListId, units, taxCharged, onAdded, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [resultsFor, setResultsFor] = useState("");
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [adding, setAdding] = useState(false);

  // Global "/" shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounced search
  useEffect(() => {
    const term = q.trim();
    if (!term) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await apiFetch<SearchResult[]>(`/api/pos/search?q=${encodeURIComponent(term)}&limit=30&priceListId=${priceListId}`, { signal: ctrl.signal });
        setResults(rows);
        setResultsFor(term);
        setActive(0);
      } catch (err) {
        if ((err as Error).name !== "AbortError") onError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, priceListId, onError]);

  const visible = q.trim() ? results : [];

  const reset = useCallback(() => {
    setQ("");
    setResults([]);
    setSelected(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const add = useCallback(
    async (r: SearchResult, quantity: string, unitCode: string) => {
      setAdding(true);
      try {
        await apiFetch(`/api/sales/${saleId}/lines`, { method: "POST", body: { variantId: r.variantId, quantity, unitCode } });
        const unitName = units.find((u) => u.code === unitCode)?.name ?? unitCode;
        await onAdded(`Added ${formatQty(quantity)} ${unitName} · ${r.productName} — ${r.variantName}`);
        reset();
      } catch (err) {
        onError(errorMessage(err));
      } finally {
        setAdding(false);
      }
    },
    [saleId, units, onAdded, onError, reset],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Escape") {
      reset();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const term = q.trim();
      if (!term || adding) return;
      if (resultsFor !== term) {
        // A barcode scanner types the code and presses Enter before the debounced search runs.
        void addExactNow(term);
        return;
      }
      const exact = findExact(visible, term);
      if (exact && exact.price) {
        void add(exact, "1", exact.unitCode);
        return;
      }
      if (visible[active]) setSelected(visible[active]);
    }
  };

  const addExactNow = async (term: string) => {
    try {
      const rows = await apiFetch<SearchResult[]>(`/api/pos/search?q=${encodeURIComponent(term)}&limit=30&priceListId=${priceListId}`);
      const exact = findExact(rows, term);
      if (exact && exact.price) {
        await add(exact, "1", exact.unitCode);
        return;
      }
      setResults(rows);
      setResultsFor(term);
      setActive(0);
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  return (
    <section className="rounded-2xl border border-navy-100 bg-white shadow-card" aria-label="Add products">
      <div className="p-3 sm:p-4">
        <label htmlFor="pos-search" className="sr-only">
          Search products
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-navy-400" />
          <input
            id="pos-search"
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSelected(null);
              if (!e.target.value.trim()) setResults([]);
            }}
            onKeyDown={onKeyDown}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="Search name, brand, size, SKU or scan barcode…"
            className="h-14 w-full rounded-xl border-2 border-navy-200 bg-navy-50/40 pl-12 pr-24 text-base font-medium text-navy-900 placeholder:text-navy-400 focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-100"
            role="combobox"
            aria-expanded={visible.length > 0}
            aria-controls="pos-search-results"
            aria-activedescendant={visible[active] ? `res-${visible[active].variantId}` : undefined}
          />
          <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
            {loading && <Spinner className="text-navy-400" />}
            {q ? (
              <button type="button" onClick={reset} className="rounded-lg p-1.5 text-navy-400 hover:bg-navy-100" aria-label="Clear search">
                <X className="h-5 w-5" />
              </button>
            ) : (
              <kbd className="hidden rounded-md border border-navy-200 bg-white px-2 py-0.5 text-xs font-bold text-navy-400 sm:inline">/</kbd>
            )}
          </div>
        </div>
        {!q.trim() && (
          <p className="mt-2 flex items-center gap-1.5 px-1 text-xs text-navy-500">
            <ScanLine className="h-3.5 w-3.5" /> Type to search · ↑↓ to move · Enter to choose · exact SKU/barcode + Enter adds 1 instantly
          </p>
        )}
      </div>

      {selected && (
        <AddPanel key={selected.variantId} r={selected} units={units} taxCharged={taxCharged} busy={adding} onCancel={() => setSelected(null)} onAdd={(qty, unit) => add(selected, qty, unit)} />
      )}

      {q.trim() && !selected && (
        <ul id="pos-search-results" role="listbox" className="max-h-[52vh] divide-y divide-navy-50 overflow-y-auto border-t border-navy-100">
          {visible.length === 0 && !loading && <li className="px-5 py-6 text-center text-sm text-navy-500">No matching products. Try a brand, size or SKU.</li>}
          {visible.map((r, i) => (
            <li key={r.variantId} id={`res-${r.variantId}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => setSelected(r)}
                className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors sm:px-5", i === active ? "bg-gold-50" : "hover:bg-navy-50/60")}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-navy-900">{r.productName}</span>
                    {r.isSample && <SampleBadge label="Sample" />}
                  </span>
                  <span className="block text-sm text-navy-700">{r.variantName}</span>
                  <span className="mt-0.5 block text-xs text-navy-400">
                    {[r.brandName, r.categoryName, r.sku].filter(Boolean).join(" · ")}
                    {r.tiers.length > 0 && <span className="ml-1 font-semibold text-gold-700">· bulk prices</span>}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {r.price ? (
                    <>
                      <span className="block text-base font-extrabold text-navy-900 tabular">{formatINR(r.price)}</span>
                      <span className="block text-[11px] text-navy-500">
                        per {r.unitName}
                        {taxCharged ? (r.priceIncludesTax ? " · incl. GST" : " · + GST") : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs font-semibold text-red-700">No price set</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AddPanel({
  r,
  units,
  taxCharged,
  busy,
  onCancel,
  onAdd,
}: {
  r: SearchResult;
  units: PosUnit[];
  taxCharged: boolean;
  busy: boolean;
  onCancel: () => void;
  onAdd: (qty: string, unitCode: string) => void;
}) {
  const unitOptions = useMemo(
    () => [
      { code: r.unitCode, name: r.unitName, factor: "1", decimals: r.unitDecimals },
      ...r.conversions.map((c) => {
        const u = units.find((x) => x.code === c.unitCode);
        return { code: c.unitCode, name: u?.name ?? c.unitCode, factor: c.factor, decimals: u?.decimals ?? 0 };
      }),
    ],
    [r, units],
  );
  const [unitCode, setUnitCode] = useState(r.unitCode);
  const [qty, setQty] = useState("1");
  const qtyRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    qtyRef.current?.select();
  }, []);
  const unit = unitOptions.find((u) => u.code === unitCode) ?? unitOptions[0];
  const qtyRe = unit.decimals > 0 ? new RegExp(`^\\d{1,7}(\\.\\d{1,${unit.decimals}})?$`) : /^\d{1,7}$/;
  const valid = qtyRe.test(qty) && D(qty).greaterThan(0);
  const factor = D(unit.factor);
  const baseQty = valid ? D(qty).times(factor) : D(0);
  let unitPrice = r.price ? D(r.price) : null;
  let tierApplied = false;
  for (const t of r.tiers) {
    if (unitPrice && baseQty.greaterThanOrEqualTo(D(t.minQty))) {
      unitPrice = D(t.price);
      tierApplied = true;
    }
  }
  const pricePerChosen = unitPrice ? unitPrice.times(factor) : null;
  const step = (delta: number) => {
    const n = D(valid ? qty : "0").plus(delta);
    if (n.greaterThan(0)) setQty(n.toString());
  };

  return (
    <div className="animate-fade-in border-t border-gold-200 bg-gold-50/60 px-4 py-4 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 font-bold text-navy-900">
            {r.productName}
            {r.isSample && <SampleBadge label="Sample" />}
          </div>
          <div className="text-sm text-navy-700">{r.variantName}</div>
          <div className="text-xs text-navy-500">
            {r.sku}
            {r.hsnCode ? ` · HSN ${r.hsnCode}` : ""}
            {r.mrp ? ` · MRP ${formatINR(r.mrp)}` : ""}
          </div>
          {r.tiers.length > 0 && (
            <div className="mt-1 text-xs font-semibold text-gold-700">
              Bulk: {r.tiers.map((t) => `${formatQty(t.minQty)}+ ${r.unitName} @ ${formatINR(t.price)}`).join(" · ")}
            </div>
          )}
        </div>
        <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-navy-500 hover:bg-white" aria-label="Back to results">
          <X className="h-5 w-5" />
        </button>
      </div>

      {!r.price ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">No selling price is configured for this item. An authorised admin must set a price before it can be sold.</p>
      ) : (
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onAdd(qty, unitCode);
          }}
        >
          <div>
            <label htmlFor="add-qty" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-navy-700">
              Quantity
            </label>
            <div className="flex items-center">
              <button type="button" onClick={() => step(-1)} className="h-12 w-12 rounded-l-xl border border-r-0 border-navy-200 bg-white text-navy-700 hover:bg-navy-50" aria-label="Decrease">
                <Minus className="mx-auto h-4 w-4" />
              </button>
              <input
                id="add-qty"
                ref={qtyRef}
                inputMode={unit.decimals ? "decimal" : "numeric"}
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))}
                className="h-12 w-24 border border-navy-200 bg-white text-center text-lg font-bold tabular focus:border-gold-500 focus:outline-none"
                aria-invalid={!valid}
              />
              <button type="button" onClick={() => step(1)} className="h-12 w-12 rounded-r-xl border border-l-0 border-navy-200 bg-white text-navy-700 hover:bg-navy-50" aria-label="Increase">
                <Plus className="mx-auto h-4 w-4" />
              </button>
            </div>
          </div>
          {unitOptions.length > 1 ? (
            <div>
              <label htmlFor="add-unit" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-navy-700">
                Sell by
              </label>
              <select
                id="add-unit"
                value={unitCode}
                onChange={(e) => setUnitCode(e.target.value)}
                className="h-12 rounded-xl border border-navy-200 bg-white px-3 text-sm font-semibold focus:border-gold-500 focus:outline-none"
              >
                {unitOptions.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.name}
                    {u.factor !== "1" ? ` (= ${formatQty(u.factor)} ${r.unitName})` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="pb-3 text-sm font-semibold text-navy-600">{r.unitName}</div>
          )}
          <div className="min-w-32 flex-1 pb-1 text-sm">
            {pricePerChosen && (
              <>
                <div className="text-navy-500">
                  {formatINR(pricePerChosen)} / {unit.name}
                  {taxCharged ? (r.priceIncludesTax ? " incl. GST" : " + GST") : ""}
                  {tierApplied && <span className="ml-1 font-semibold text-gold-700">(bulk price)</span>}
                </div>
                {valid && <div className="text-lg font-extrabold text-navy-900 tabular">{formatINR(pricePerChosen.times(D(qty)))}</div>}
              </>
            )}
          </div>
          <Button type="submit" variant="gold" size="lg" loading={busy} disabled={!valid} icon={<PackagePlus className="h-5 w-5" />}>
            Add to cart
          </Button>
        </form>
      )}
      {!valid && qty && (
        <p className="mt-2 text-xs text-red-700">{unit.decimals ? `Up to ${unit.decimals} decimal places` : `${unit.name} must be a whole number`}</p>
      )}
      {r.price && <p className="mt-2 text-[11px] text-navy-500">Price shown: {priceLabel(r, taxCharged)} per {r.unitName}. The server recalculates every amount.</p>}
    </div>
  );
}
