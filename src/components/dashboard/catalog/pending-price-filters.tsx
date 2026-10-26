"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { cn } from "@/components/ui/cn";
import { PENDING_PRICE_FILTER_KEYS, PENDING_PRICE_SORTS, PRICE_CHANGES, PRICE_SOURCES, isFiltered, parsePendingPriceFilter } from "@/lib/price-filters";
import { categoryTree, type CategoryOption } from "./types";

export interface BrandCount {
  brandId: string | null;
  name: string;
  count: number;
}

/**
 * Filters for the prices waiting for approval, kept in the page address. Lists apply as soon as they
 * change; the search and price boxes on "Apply". Any change goes back to the first page (`pageParam`).
 * On a phone only the search box shows until "Filters" is tapped.
 */
export function PendingPriceFilters({ brands, categories, pageParam, inset }: { brands: BrandCount[]; categories: CategoryOption[]; pageParam: string; /** Inside a card: no shadow of its own. */ inset?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const current = parsePendingPriceFilter(params);
  const narrowing = PENDING_PRICE_FILTER_KEYS.filter((k) => k !== "q" && k !== "sort" && k !== "importBatchId" && current[k] !== undefined).length;
  const folded = !open && "max-sm:hidden";

  const go = (next: URLSearchParams) => {
    next.delete(pageParam);
    start(() => router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  const apply = (patch: Partial<Record<(typeof PENDING_PRICE_FILTER_KEYS)[number], string>>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v && v.trim()) next.set(k, v.trim());
      else next.delete(k);
    }
    go(next);
  };
  const clear = () => {
    const next = new URLSearchParams(params.toString());
    for (const k of PENDING_PRICE_FILTER_KEYS) next.delete(k);
    go(next);
  };

  const brandOptions = brands.map((b) => ({ value: b.brandId ?? "none", label: `${b.name} (${b.count.toLocaleString("en-IN")})` }));
  if (current.brandId && !brandOptions.some((o) => o.value === current.brandId)) brandOptions.unshift({ value: current.brandId, label: current.brandId === "none" ? "No brand (0)" : "This brand (0)" });
  const select = (name: "brandId" | "categoryId" | "source" | "change" | "sort", label: string, all: string, options: { value: string; label: string }[]) => (
    <div className={cn("w-full sm:w-[168px]", folded)}>
      <Label htmlFor={`pf-${name}`}>{label}</Label>
      <Select
        id={`pf-${name}`}
        value={current[name] ?? (name === "sort" ? "newest" : "")}
        onChange={(e) => apply({ [name]: name === "sort" && e.target.value === "newest" ? "" : e.target.value })}
      >
        {all && <option value="">{all}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );

  return (
    <div className="no-print space-y-2">
      <form
        role="search"
        aria-label="Filter prices waiting for approval"
        aria-busy={pending}
        className={cn("rounded-xl border border-navy-100 px-4 pb-4 pt-3.5", inset ? "bg-paper/60" : "bg-white shadow-card")}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          apply({ q: String(data.get("q") ?? ""), min: String(data.get("min") ?? ""), max: String(data.get("max") ?? "") });
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-[2]">
            <Label htmlFor="pf-q">Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
              <Input key={current.q ?? ""} id="pf-q" name="q" type="search" defaultValue={current.q ?? ""} placeholder="Product name or SKU" className="pl-9" maxLength={100} />
            </div>
          </div>
          {select("brandId", "Brand", "All brands", brandOptions)}
          {select(
            "categoryId",
            "Category",
            "All categories",
            categoryTree(categories).map((c) => ({ value: c.id, label: `${"  ".repeat(c.depth)}${c.depth ? "↳ " : ""}${c.name}` })),
          )}
          {select("source", "Source", "All sources", PRICE_SOURCES)}
          {select("change", "Change", "Any change", PRICE_CHANGES)}
          <div className={cn("w-[120px] max-sm:min-w-[110px] max-sm:flex-1", folded)}>
            <Label htmlFor="pf-min">Price from (₹)</Label>
            <Input key={`min-${current.min ?? ""}`} id="pf-min" name="min" inputMode="decimal" pattern="\d{1,9}(\.\d{1,2})?" title="An amount like 500 or 499.50" defaultValue={current.min ?? ""} placeholder="incl. GST" className="tabular text-[13px]" />
          </div>
          <div className={cn("w-[120px] max-sm:min-w-[110px] max-sm:flex-1", folded)}>
            <Label htmlFor="pf-max">Price to (₹)</Label>
            <Input key={`max-${current.max ?? ""}`} id="pf-max" name="max" inputMode="decimal" pattern="\d{1,9}(\.\d{1,2})?" title="An amount like 5000 or 4999.50" defaultValue={current.max ?? ""} placeholder="incl. GST" className="tabular text-[13px]" />
          </div>
          {select("sort", "Sort", "", PENDING_PRICE_SORTS)}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" className="sm:hidden" aria-expanded={open} icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setOpen((o) => !o)}>
              {open ? "Fewer filters" : narrowing ? `Filters (${narrowing})` : "Filters"}
            </Button>
            {isFiltered(current) && (
              <Button variant="ghost" icon={<X className="h-4 w-4" />} onClick={clear}>
                Clear
              </Button>
            )}
            <Button type="submit" loading={pending} icon={<Search className="h-4 w-4" />}>
              Apply
            </Button>
          </div>
        </div>
      </form>
      {current.importBatchId && (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-navy-700">
          Showing only the prices from one bulk import.
          <button type="button" className="font-semibold text-gold-700 underline-offset-[3px] hover:underline" onClick={() => apply({ importBatchId: "" })}>
            Show all waiting prices
          </button>
        </p>
      )}
    </div>
  );
}
