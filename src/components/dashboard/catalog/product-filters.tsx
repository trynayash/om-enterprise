"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { categoryTree, type CategoryOption, type Option } from "./types";

const STATUSES = [
  { value: "all", label: "All products" },
  { value: "published", label: "Published on website" },
  { value: "unpublished", label: "Not published" },
  { value: "needs_review", label: "Needs review" },
  { value: "inactive", label: "Inactive" },
  { value: "sample", label: "Sample data" },
];

const PRICES = [
  { value: "", label: "Any price" },
  { value: "live", label: "Has a price" },
  { value: "none", label: "No price yet" },
  { value: "missing", label: "Some sizes have no price" },
  { value: "pending", label: "Waiting for approval" },
  { value: "stale", label: "Due for review" },
  { value: "scheduled", label: "Scheduled change" },
];

const SORTS = [
  { value: "", label: "Recently updated" },
  { value: "name", label: "Name A–Z" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

const FILTER_KEYS = ["q", "categoryId", "brandId", "status", "price", "min", "max", "sort"];

/** "₹1,250" and "1250" both become "1250"; null when it still isn't an amount the server accepts. */
function amount(v: string): string | null {
  const s = v.replace(/[₹,\s]/g, "");
  return !s || /^\d{1,9}(\.\d{1,2})?$/.test(s) ? s : null;
}

export function ProductFilters({ categories, brands, counts }: { categories: CategoryOption[]; brands: Option[]; counts?: Record<string, number> }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [min, setMin] = useState(params.get("min") ?? "");
  const [max, setMax] = useState(params.get("max") ?? "");
  const [bad, setBad] = useState<{ min?: boolean; max?: boolean }>({});

  // A category's count includes its sub-categories, as the filter does.
  const tree = useMemo(() => {
    const children = new Map<string, string[]>();
    for (const c of categories) if (c.parentId) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c.id]);
    const total = (id: string, seen: Set<string>): number => {
      if (seen.has(id)) return 0;
      seen.add(id);
      return (counts?.[id] ?? 0) + (children.get(id) ?? []).reduce((n, child) => n + total(child, seen), 0);
    };
    return categoryTree(categories).map((c) => ({ ...c, total: counts ? total(c.id, new Set()) : null }));
  }, [categories, counts]);

  const apply = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v && v !== "all") next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    start(() => router.push(`/dashboard/products${next.size ? `?${next}` : ""}`));
  };

  const hasFilters = FILTER_KEYS.some((k) => params.get(k));
  const narrowing = ["categoryId", "brandId", "status", "price"].filter((k) => params.get(k) && params.get(k) !== "all").length + (params.get("min") || params.get("max") ? 1 : 0);
  // On a phone the lists stay folded until "Filters" is tapped, so products show first.
  const [open, setOpen] = useState(false);
  const folded = !open && "max-sm:hidden";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const lo = amount(min);
        const hi = amount(max);
        setBad({ min: lo === null, max: hi === null });
        if (lo === null || hi === null) return;
        setMin(lo);
        setMax(hi);
        apply({ q: q.trim(), min: lo, max: hi });
      }}
      className="mb-5 grid gap-2.5 rounded-xl border border-navy-100 bg-white p-3 shadow-card"
      aria-busy={pending}
    >
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(220px,2fr)_1fr_1fr_1fr]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, model, SKU or barcode"
            className="pl-9"
            aria-label="Search products"
          />
        </div>
        <Select className={cn(folded)} aria-label="Category" value={params.get("categoryId") ?? ""} onChange={(e) => apply({ categoryId: e.target.value })}>
          <option value="">All categories</option>
          {tree.map((c) => (
            <option key={c.id} value={c.id}>
              {"  ".repeat(c.depth)}
              {c.depth ? "↳ " : ""}
              {c.name}
              {c.total !== null ? ` (${c.total})` : ""}
            </option>
          ))}
        </Select>
        <Select className={cn(folded)} aria-label="Brand" value={params.get("brandId") ?? ""} onChange={(e) => apply({ brandId: e.target.value })}>
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select className={cn(folded)} aria-label="Status" value={params.get("status") ?? "all"} onChange={(e) => apply({ status: e.target.value })}>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className={cn("w-full sm:w-auto sm:min-w-44 sm:flex-1", folded)}>
          <Select aria-label="Price" value={params.get("price") ?? ""} onChange={(e) => apply({ price: e.target.value })}>
            {PRICES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <div className={cn("flex w-full items-center gap-2 sm:w-auto", folded)} title="Price in ₹ including GST. Press Search to apply.">
          <Input
            inputMode="decimal"
            value={min}
            onChange={(e) => {
              setMin(e.target.value);
              setBad((b) => ({ ...b, min: false }));
            }}
            placeholder="From ₹"
            aria-label="Lowest price, ₹ incl. GST"
            aria-invalid={bad.min || undefined}
            className="tabular sm:w-28"
          />
          <span aria-hidden className="text-navy-400">
            –
          </span>
          <Input
            inputMode="decimal"
            value={max}
            onChange={(e) => {
              setMax(e.target.value);
              setBad((b) => ({ ...b, max: false }));
            }}
            placeholder="To ₹"
            aria-label="Highest price, ₹ incl. GST"
            aria-invalid={bad.max || undefined}
            className="tabular sm:w-28"
          />
        </div>
        <div className={cn("w-full sm:w-auto sm:min-w-44 sm:flex-1", folded)}>
          <Select aria-label="Sort" value={params.get("sort") ?? ""} onChange={(e) => apply({ sort: e.target.value })}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <Button variant="outline" className="sm:hidden" aria-expanded={open} icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setOpen((o) => !o)}>
            {open ? "Fewer filters" : narrowing ? `Filters (${narrowing})` : "Filters"}
          </Button>
          {hasFilters && (
            <Button
              variant="ghost"
              icon={<X className="h-4 w-4" />}
              onClick={() => {
                setQ("");
                setMin("");
                setMax("");
                setBad({});
                start(() => router.push("/dashboard/products"));
              }}
            >
              Clear
            </Button>
          )}
          <Button type="submit" loading={pending} className="flex-1 sm:flex-none">
            Search
          </Button>
        </div>
      </div>
    </form>
  );
}
