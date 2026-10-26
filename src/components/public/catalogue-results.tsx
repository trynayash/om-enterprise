import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getPublicBrands, searchPublicProducts } from "@/server/services/public-catalog";
import { cn } from "@/components/ui/cn";
import { LinkButton } from "@/components/ui/button";
import { CatalogueFilters } from "./catalogue-filters";
import { paginationHref, type CatalogueQuery } from "./catalogue-query";
import { ProductGrid } from "./product-card";
import { getSiteData } from "./site-data";
import { TechnicalDrawing } from "./technical-drawing";

export { parseCatalogueQuery } from "./catalogue-query";

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
  const first = (result.page - 1) * result.pageSize + 1;
  const last = Math.min(result.total, result.page * result.pageSize);

  return (
    <div className="space-y-5">
      <CatalogueFilters
        query={filterQuery}
        categories={categories.filter((c) => !c.parentId).map((c) => ({ slug: c.slug, name: c.name }))}
        brands={brands}
        basePath={basePath}
        hideCategory={!!lockCategory}
      />
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-navy-100 pb-2.5">
        <p className="text-sm text-navy-600">
          {result.total === 0 ? (
            "No products found"
          ) : (
            <>
              <span className="tabular font-medium text-navy-950">{result.total}</span> {result.total === 1 ? "product" : "products"}
              {totalPages > 1 && (
                <span className="text-navy-400">
                  {" "}
                  · showing <span className="tabular">{first}–{last}</span>
                </span>
              )}
            </>
          )}
          {query.q && (
            <>
              {" "}
              for <span className="font-semibold text-navy-950">“{query.q}”</span>
            </>
          )}
        </p>
        {website.showPrices && result.total > 0 && <span className="text-xs text-navy-500">Prices are current selling prices and include any taxes.</span>}
      </div>
      {result.items.length ? (
        <ProductGrid items={result.items} />
      ) : (
        <div className="blueprint flex flex-col items-center rounded-xl border border-navy-200 px-6 py-14 text-center">
          <TechnicalDrawing kind="box" className="h-24 w-32 text-navy-400" />
          <h2 className="mt-4 text-lg font-semibold text-navy-950">We couldn&apos;t find a match</h2>
          <p className="mt-1 max-w-md text-sm leading-relaxed text-navy-500">
            Try a different word or size, or browse all products. Can&apos;t see what you need? Ask us — not everything we sell is listed online yet.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            <LinkButton href="/products">Browse all products</LinkButton>
            <LinkButton href="/contact" variant="outline">
              Ask us
            </LinkButton>
          </div>
        </div>
      )}
      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1.5 pt-4" aria-label="Pagination">
          <PageLink disabled={query.page <= 1} href={paginationHref(basePath, filterQuery, query.page - 1)} label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </PageLink>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((n) => n === 1 || n === totalPages || Math.abs(n - query.page) <= 1)
            .map((n, idx, arr) => (
              <span key={n} className="flex items-center gap-1.5">
                {idx > 0 && n - arr[idx - 1] > 1 && <span className="px-1 tabular text-navy-400">…</span>}
                <Link
                  href={paginationHref(basePath, filterQuery, n)}
                  aria-current={n === query.page ? "page" : undefined}
                  className={cn(
                    "flex h-10 min-w-10 items-center justify-center rounded-lg px-3 tabular text-sm transition-colors",
                    n === query.page ? "bg-navy-900 text-white" : "border border-navy-200 bg-white text-navy-800 hover:border-navy-900",
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
      <span aria-disabled className="flex h-10 w-10 items-center justify-center rounded-lg border border-navy-100 text-navy-300">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className="flex h-10 w-10 items-center justify-center rounded-lg border border-navy-200 bg-white text-navy-800 transition-colors hover:border-navy-900">
      {children}
    </Link>
  );
}
