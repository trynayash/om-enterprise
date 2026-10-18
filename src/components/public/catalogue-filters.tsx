"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/components/ui/cn";

export interface CatalogueQuery {
  q: string;
  category: string;
  brand: string;
  sort: string;
}

function buildHref(base: string, q: CatalogueQuery) {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.category) p.set("category", q.category);
  if (q.brand) p.set("brand", q.brand);
  if (q.sort && q.sort !== "name") p.set("sort", q.sort);
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

const selectCls =
  "h-11 w-full rounded-xl border border-navy-200 bg-white px-3 text-sm font-medium text-navy-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-200";

export function CatalogueFilters({
  query,
  categories,
  brands,
  basePath = "/products",
  hideCategory,
}: {
  query: CatalogueQuery;
  categories: { slug: string; name: string }[];
  brands: { slug: string; name: string }[];
  basePath?: string;
  hideCategory?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState(query.q);
  const go = (next: Partial<CatalogueQuery>) => start(() => router.push(buildHref(basePath, { ...query, ...next }), { scroll: false }));
  const active = !!(query.q || query.brand || (!hideCategory && query.category) || (query.sort && query.sort !== "name"));

  return (
    <div className={cn("rounded-2xl border border-navy-100 bg-white p-3 shadow-card transition-opacity sm:p-4", pending && "opacity-70")}>
      <div className="grid gap-3 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: text.trim() });
          }}
          className="relative"
        >
          <label htmlFor="cat-q" className="sr-only">
            Search products
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
          <input
            id="cat-q"
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search name, size, SKU…"
            className="h-11 w-full rounded-xl border border-navy-200 bg-white pl-9 pr-24 text-sm text-navy-900 placeholder:text-navy-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-200"
          />
          <button type="submit" className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2 rounded-lg bg-navy-900 px-3 text-xs font-bold text-white hover:bg-navy-800">
            Search
          </button>
        </form>
        {!hideCategory ? (
          <div>
            <label htmlFor="cat-category" className="sr-only">
              Category
            </label>
            <select id="cat-category" className={selectCls} value={query.category} onChange={(e) => go({ category: e.target.value })}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="hidden md:block" />
        )}
        <div>
          <label htmlFor="cat-brand" className="sr-only">
            Brand
          </label>
          <select id="cat-brand" className={selectCls} value={query.brand} onChange={(e) => go({ brand: e.target.value })}>
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cat-sort" className="sr-only">
            Sort
          </label>
          <select id="cat-sort" className={selectCls} value={query.sort || "name"} onChange={(e) => go({ sort: e.target.value })}>
            <option value="name">Sort: Name A–Z</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
          </select>
        </div>
      </div>
      {active && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-navy-50 pt-3 text-xs">
          <SlidersHorizontal className="h-3.5 w-3.5 text-navy-400" />
          {query.q && <Chip label={`“${query.q}”`} onClear={() => (setText(""), go({ q: "" }))} />}
          {!hideCategory && query.category && <Chip label={categories.find((c) => c.slug === query.category)?.name ?? query.category} onClear={() => go({ category: "" })} />}
          {query.brand && <Chip label={brands.find((b) => b.slug === query.brand)?.name ?? query.brand} onClear={() => go({ brand: "" })} />}
          <button
            type="button"
            onClick={() => {
              setText("");
              start(() => router.push(hideCategory && query.category ? basePath : basePath, { scroll: false }));
            }}
            className="ml-auto font-semibold text-navy-600 underline-offset-2 hover:text-navy-900 hover:underline"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-navy-50 py-1 pl-3 pr-1.5 font-semibold text-navy-800 ring-1 ring-navy-100">
      {label}
      <button type="button" onClick={onClear} className="rounded-full p-0.5 hover:bg-navy-100" aria-label={`Remove filter ${label}`}>
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export function paginationHref(base: string, q: CatalogueQuery, page: number) {
  const href = buildHref(base, q);
  if (page <= 1) return href;
  return `${href}${href.includes("?") ? "&" : "?"}page=${page}`;
}
