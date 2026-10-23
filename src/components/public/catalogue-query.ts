/** Catalogue URL state, shared by the server results list and the client filters. */
export interface CatalogueQuery {
  q: string;
  category: string;
  brand: string;
  sort: string;
}

export function catalogueHref(base: string, q: CatalogueQuery) {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.category) p.set("category", q.category);
  if (q.brand) p.set("brand", q.brand);
  if (q.sort && q.sort !== "name") p.set("sort", q.sort);
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

export function paginationHref(base: string, q: CatalogueQuery, page: number) {
  const href = catalogueHref(base, q);
  if (page <= 1) return href;
  return `${href}${href.includes("?") ? "&" : "?"}page=${page}`;
}

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
