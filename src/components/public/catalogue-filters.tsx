"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { catalogueHref, type CatalogueQuery } from "./catalogue-query";

const selectCls =
  "select-chevron h-11 w-full rounded-lg border border-navy-200 bg-white pl-3 pr-8 text-sm text-navy-900 transition-[border-color,box-shadow] hover:border-navy-300 focus:border-navy-800 focus:outline-none focus:ring-[3px] focus:ring-gold-300/45";

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
  const go = (next: Partial<CatalogueQuery>) => start(() => router.push(catalogueHref(basePath, { ...query, ...next }), { scroll: false }));
  const active = !!(query.q || query.brand || (!hideCategory && query.category) || (query.sort && query.sort !== "name"));

  return (
    <div className={cn("transition-opacity duration-200", pending && "opacity-60")} aria-busy={pending || undefined}>
      <div className={cn("grid grid-cols-2 gap-2.5", hideCategory ? "md:grid-cols-[1.8fr_1fr_1fr]" : "md:grid-cols-[1.6fr_1fr_1fr_1fr]")}>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: text.trim() });
          }}
          className="relative col-span-2 md:col-span-1"
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
            placeholder="Name, size or SKU"
            className="h-11 w-full rounded-lg border border-navy-200 bg-white pl-9 pr-24 text-sm text-navy-900 placeholder:text-navy-400 transition-[border-color,box-shadow] hover:border-navy-300 focus:border-navy-800 focus:outline-none focus:ring-[3px] focus:ring-gold-300/45"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2 rounded-md bg-navy-900 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-navy-800 active:translate-y-[calc(-50%+1px)]"
          >
            Search
          </button>
        </form>
        {!hideCategory && (
          <div className="col-span-2 md:col-span-1">
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
            <option value="name">Sort: name A–Z</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
          </select>
        </div>
      </div>
      {active && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="label-caps text-navy-400">Filtered by</span>
          {query.q && <Chip label={`“${query.q}”`} onClear={() => (setText(""), go({ q: "" }))} />}
          {!hideCategory && query.category && <Chip label={categories.find((c) => c.slug === query.category)?.name ?? query.category} onClear={() => go({ category: "" })} />}
          {query.brand && <Chip label={brands.find((b) => b.slug === query.brand)?.name ?? query.brand} onClear={() => go({ brand: "" })} />}
          {query.sort && query.sort !== "name" && <Chip label={query.sort === "price_asc" ? "Price ↑" : "Price ↓"} onClear={() => go({ sort: "name" })} />}
          <button
            type="button"
            onClick={() => {
              setText("");
              start(() => router.push(basePath, { scroll: false }));
            }}
            className="link-draw ml-auto font-semibold text-navy-700 hover:text-navy-950"
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
    <span className="inline-flex animate-fade-in items-center gap-1 rounded-md border border-navy-200 bg-white py-1 pl-2.5 pr-1 font-medium text-navy-800">
      {label}
      <button type="button" onClick={onClear} className="rounded-sm p-0.5 text-navy-400 transition-colors hover:bg-navy-50 hover:text-navy-900" aria-label={`Remove filter ${label}`}>
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
