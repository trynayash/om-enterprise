import Link from "next/link";
import { ChevronLeft, ChevronRight, PackageSearch } from "lucide-react";
import { getPublicBrands, searchPublicProducts } from "@/server/services/public-catalog";
import { cn } from "@/components/ui/cn";
import { CatalogueFilters, paginationHref, type CatalogueQuery } from "./catalogue-filters";
import { ProductGrid } from "./product-card";
import { getSiteData } from "./site-data";

export function parseCatalogueQuery(sp: Record<string, string | string[] | undefined>): CatalogueQuery & { page: number } {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.slice(0, 100).trim() ?? "";
  };
  const sort = one("sort");
  const page = Math.max(1, Math.min(500, Number(one("page")) || 1));
  return {
    q: one("q"),
    category: one("category"),
    brand: one("brand"),
    sort: sort === "price_asc" || sort === "price_desc" ? sort : "name",
    page,
  };
}

/** Filters + product grid + pagination (server component; reads the DB at request time). */
export async function CatalogueResults({
  query,
  basePath = "/products",
  lockCategory,
}: {
  query: CatalogueQuery & { page: number };
  basePath?: string;
  lockCategory?: string;
}) {
  const { categories, website } = await getSiteData();
  const category = lockCategory ?? query.category;
  const [brands, result] = [
    await getPublicBrands().catch(() => []),
    await searchPublicProducts({
      q: query.q || undefined,
      category: category || undefined,
      brand: query.brand || undefined,
      sort: query.sort as "name" | "price_asc" | "price_desc",
      page: query.page,
      pageSize: 24,
    }).catch((err) => {
      console.error("[public] catalogue unavailable", err);
      return { items: [], total: 0, page: 1, pageSize: 24 };
    }),
  ];
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const filterQuery: CatalogueQuery = { q: query.q, category: lockCategory ? "" : query.category, brand: query.brand, sort: query.sort };

  return (
    <div className="space-y-6">
      <CatalogueFilters
        query={filterQuery}
        categories={categories.filter((c) => !c.parentId).map((c) => ({ slug: c.slug, name: c.name }))}
        brands={brands}
        basePath={basePath}
        hideCategory={!!lockCategory}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-navy-500">
        <span>
          {result.total === 0 ? "No products found" : `${result.total} ${result.total === 1 ? "product" : "products"}`}
          {query.q && (
            <>
              {" "}
              for <span className="font-semibold text-navy-900">“{query.q}”</span>
            </>
          )}
        </span>
        {website.showPrices && result.total > 0 && <span className="text-xs">Prices shown are current selling prices.</span>}
      </div>
      {result.items.length ? (
        <ProductGrid items={result.items} />
      ) : (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-navy-200 bg-navy-50/50 px-6 py-16 text-center">
          <PackageSearch className="h-12 w-12 text-navy-300" />
          <h2 className="mt-4 text-lg font-bold text-navy-900">We couldn&apos;t find a match</h2>
          <p className="mt-1 max-w-md text-sm text-navy-500">
            Try a different word or size, or browse all products. Can&apos;t see what you need? Ask us — we stock much more than what&apos;s listed online.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href="/products" className="inline-flex h-10 items-center rounded-lg bg-navy-900 px-4 text-sm font-semibold text-white hover:bg-navy-800">
              Browse all products
            </Link>
            <Link href="/contact" className="inline-flex h-10 items-center rounded-lg border border-navy-200 px-4 text-sm font-semibold text-navy-900 hover:bg-white">
              Ask us
            </Link>
          </div>
        </div>
      )}
      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-2 pt-4" aria-label="Pagination">
          <PageLink disabled={query.page <= 1} href={paginationHref(basePath, filterQuery, query.page - 1)} label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </PageLink>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((n) => n === 1 || n === totalPages || Math.abs(n - query.page) <= 1)
            .map((n, idx, arr) => (
              <span key={n} className="flex items-center gap-2">
                {idx > 0 && n - arr[idx - 1] > 1 && <span className="text-navy-400">…</span>}
                <Link
                  href={paginationHref(basePath, filterQuery, n)}
                  aria-current={n === query.page ? "page" : undefined}
                  className={cn(
                    "flex h-10 min-w-10 items-center justify-center rounded-xl px-3 text-sm font-semibold",
                    n === query.page ? "bg-navy-900 text-white" : "border border-navy-200 bg-white text-navy-800 hover:bg-navy-50",
                  )}
                >
                  {n}
                </Link>
              </span>
            ))}
          <PageLink disabled={query.page >= totalPages} href={paginationHref(basePath, filterQuery, query.page + 1)} label="Next page">
            <ChevronRight className="h-4 w-4" />
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  if (disabled) {
    return (
      <span aria-disabled className="flex h-10 w-10 items-center justify-center rounded-xl border border-navy-100 text-navy-300">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className="flex h-10 w-10 items-center justify-center rounded-xl border border-navy-200 bg-white text-navy-800 hover:bg-navy-50">
      {children}
    </Link>
  );
}
