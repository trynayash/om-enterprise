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
    <section className="rounded-xl border border-navy-200 bg-white shadow-card" aria-label="Add products">
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
            className="h-14 w-full rounded-lg border border-navy-200 bg-white pl-12 pr-24 text-[17px] max-sm:pr-20 text-navy-950 placeholder:text-navy-400 transition-[border-color,box-shadow] duration-150 hover:border-navy-300 focus:border-navy-800 focus:outline-none focus:ring-[3px] focus:ring-gold-300/45"
            role="combobox"
            aria-expanded={visible.length > 0}
            aria-controls="pos-search-results"
            aria-activedescendant={visible[active] ? `res-${visible[active].variantId}` : undefined}
          />
          <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
            {loading && <Spinner className="text-navy-400" />}
            {q ? (
              <button type="button" onClick={reset} className="rounded-md p-1.5 text-navy-400 transition-colors hover:bg-navy-50 hover:text-navy-900" aria-label="Clear search">
                <X className="h-5 w-5" />
              </button>
            ) : (
              <Kbd className="hidden sm:inline-flex">/</Kbd>
            )}
          </div>
        </div>
        {!q.trim() && (
          <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-0.5 text-xs text-navy-500">
            <span className="inline-flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> move
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>Enter</Kbd> choose
            </span>
            <span className="inline-flex items-center gap-1">
              <ScanLine className="h-3.5 w-3.5" /> exact SKU or barcode + <Kbd>Enter</Kbd> adds 1 instantly
            </span>
          </p>
        )}
      </div>

      {selected && (
        <AddPanel key={selected.variantId} r={selected} units={units} taxCharged={taxCharged} busy={adding} onCancel={() => setSelected(null)} onAdd={(qty, unit) => add(selected, qty, unit)} />
      )}

      {q.trim() && !selected && (
        <ul id="pos-search-results" role="listbox" className="max-h-[52vh] divide-y divide-navy-100 overflow-y-auto border-t border-navy-200">
          {visible.length === 0 && !loading && <li className="px-5 py-6 text-center text-sm text-navy-500">No matching products. Try a brand, size or SKU.</li>}
          {visible.map((r, i) => (
            <li key={r.variantId} id={`res-${r.variantId}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => setSelected(r)}
                className={cn(
                  "flex w-full items-center gap-4 px-4 py-3 text-left transition-colors duration-100 sm:px-5",
                  i === active ? "bg-gold-50 shadow-[inset_3px_0_0_var(--color-gold-500)]" : "hover:bg-paper/60",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-navy-950">{r.productName}</span>
                    {r.isSample && <SampleBadge label="Sample" />}
                  </span>
                  <span className="block text-sm text-navy-700">{r.variantName}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-navy-500">
                    <span className="font-mono text-navy-700">{r.sku}</span>
                    {[r.brandName, r.categoryName].filter(Boolean).map((t) => (
                      <span key={t} className="before:mr-2 before:text-navy-300 before:content-['·']">
                        {t}
                      </span>
                    ))}
                    {r.tiers.length > 0 && <span className="font-medium text-gold-700 before:mr-2 before:text-navy-300 before:content-['·']">bulk prices</span>}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {r.price ? (
                    <>
                      <span className="block font-mono text-[15px] font-semibold text-navy-950 tabular">{formatINR(r.price)}</span>
                      <span className="mt-0.5 block text-[11px] text-navy-500">
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

function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[3px] border border-navy-200 bg-paper px-1 font-mono text-[10.5px] font-medium leading-none text-navy-600 shadow-[inset_0_-1px_0_var(--color-navy-200)]",
        className,
      )}
    >
      {children}
    </kbd>
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
    <div className="animate-fade-in border-t border-navy-200 bg-paper/70 px-4 py-4 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-semibold text-navy-950">
            {r.productName}
            {r.isSample && <SampleBadge label="Sample" />}
          </div>
          <div className="text-sm text-navy-700">{r.variantName}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-xs text-navy-500">
            <span className="text-navy-700">{r.sku}</span>
            {r.hsnCode && <span>HSN {r.hsnCode}</span>}
            {r.mrp && <span>MRP {formatINR(r.mrp)}</span>}
          </div>
          {r.tiers.length > 0 && (
            <div className="mt-1.5 text-xs font-medium text-gold-700">
              Bulk: <span className="font-mono">{r.tiers.map((t) => `${formatQty(t.minQty)}+ ${r.unitName} @ ${formatINR(t.price)}`).join(" · ")}</span>
            </div>
          )}
        </div>
        <button type="button" onClick={onCancel} className="rounded-md p-1.5 text-navy-500 transition-colors hover:bg-white hover:text-navy-900" aria-label="Back to results">
          <X className="h-5 w-5" />
        </button>
      </div>

      {!r.price ? (
        <p className="mt-3 rounded-md border-l-[3px] border-red-600 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">
          No selling price is configured for this item. An authorised admin must set a price before it can be sold.
        </p>
      ) : (
        <form
          className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onAdd(qty, unitCode);
          }}
        >
          <div>
            <label htmlFor="add-qty" className="label-mono mb-1.5 block text-navy-600">
              Quantity
            </label>
            <div className="flex h-12 items-stretch overflow-hidden rounded-lg border border-navy-200 bg-white focus-within:border-navy-800 focus-within:ring-[3px] focus-within:ring-gold-300/45">
              <button type="button" onClick={() => step(-1)} className="w-12 text-navy-600 transition-colors hover:bg-navy-50 active:bg-navy-100" aria-label="Decrease">
                <Minus className="mx-auto h-4 w-4" />
              </button>
              <input
                id="add-qty"
                ref={qtyRef}
                inputMode={unit.decimals ? "decimal" : "numeric"}
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))}
                className="w-20 border-x border-navy-200 bg-white text-center font-mono text-lg font-semibold text-navy-950 tabular focus:outline-none"
                aria-invalid={!valid}
              />
              <button type="button" onClick={() => step(1)} className="w-12 text-navy-600 transition-colors hover:bg-navy-50 active:bg-navy-100" aria-label="Increase">
                <Plus className="mx-auto h-4 w-4" />
              </button>
            </div>
          </div>
          {unitOptions.length > 1 ? (
            <div>
              <label htmlFor="add-unit" className="label-mono mb-1.5 block text-navy-600">
                Sell by
              </label>
              <select
                id="add-unit"
                value={unitCode}
                onChange={(e) => setUnitCode(e.target.value)}
                className="h-12 min-w-36 rounded-lg border border-navy-200 bg-white px-3 pr-8 text-sm font-medium text-navy-900 transition-[border-color,box-shadow] duration-150 hover:border-navy-300 focus:border-navy-800 focus:outline-none focus:ring-[3px] focus:ring-gold-300/45"
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
            <div className="flex h-12 items-center text-sm font-medium text-navy-600">{r.unitName}</div>
          )}
          <div className="min-w-36 flex-1 text-sm">
            {pricePerChosen && (
              <>
                <div className="text-[13px] text-navy-500">
                  <span className="font-mono">{formatINR(pricePerChosen)}</span> / {unit.name}
                  {taxCharged ? (r.priceIncludesTax ? " incl. GST" : " + GST") : ""}
                  {tierApplied && <span className="ml-1 font-medium text-gold-700">(bulk price)</span>}
                </div>
                {valid && <div className="mt-0.5 font-mono text-xl font-semibold text-navy-950 tabular">{formatINR(pricePerChosen.times(D(qty)))}</div>}
              </>
            )}
          </div>
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!valid} icon={<PackagePlus className="h-5 w-5" />}>
            Add to cart
          </Button>
        </form>
      )}
      {!valid && qty && (
        <p className="mt-2 text-xs text-red-700">{unit.decimals ? `Up to ${unit.decimals} decimal places` : `${unit.name} must be a whole number`}</p>
      )}
      {r.price && <p className="mt-3 text-[11px] text-navy-500">Price shown: {priceLabel(r, taxCharged)} per {r.unitName}. The server recalculates every amount.</p>}
    </div>
  );
}
