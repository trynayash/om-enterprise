/**
 * Filters for the prices waiting for approval (Approvals and Price review), kept in the page address
 * so a filtered list can be shared and the server renders it. Safe to use in the browser.
 */

export type PriceSource = "list" | "market" | "import" | "manual";
export type PriceChangeKind = "new" | "up" | "down";
export type PendingPriceSort = "newest" | "product" | "price_asc" | "price_desc" | "change";

export interface PendingPriceFilter {
  /** Product or variant name, or SKU. */
  q?: string;
  /** A brand id, or "none" for products without a brand. */
  brandId?: string;
  /** A category id; its subcategories are included. */
  categoryId?: string;
  source?: PriceSource;
  change?: PriceChangeKind;
  /** Lowest price in rupees, including GST. */
  min?: string;
  /** Highest price in rupees, including GST. */
  max?: string;
  /** Only the prices brought in by one bulk import. */
  importBatchId?: string;
  sort?: PendingPriceSort;
}

export const PRICE_SOURCES: { value: PriceSource; label: string }[] = [
  { value: "list", label: "Price list" },
  { value: "market", label: "Researched market price" },
  { value: "import", label: "Bulk import" },
  { value: "manual", label: "Manual change" },
];

export const PRICE_CHANGES: { value: PriceChangeKind; label: string }[] = [
  { value: "new", label: "New price" },
  { value: "up", label: "Increase" },
  { value: "down", label: "Decrease" },
];

export const PENDING_PRICE_SORTS: { value: PendingPriceSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "product", label: "Product" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "change", label: "Biggest change" },
];

/** The address keys the filter uses. */
export const PENDING_PRICE_FILTER_KEYS = ["q", "brandId", "categoryId", "source", "change", "min", "max", "importBatchId", "sort"] as const;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A rupee amount: up to 9 digits and 2 decimals. */
export const PRICE_AMOUNT_RE = /^\d{1,9}(\.\d{1,2})?$/;
export const MAX_FILTER_SEARCH = 100;

type ParamSource = URLSearchParams | Record<string, unknown>;

function read(src: ParamSource, key: string): string | undefined {
  const raw = src instanceof URLSearchParams ? src.get(key) : src[key];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

const oneOf = <T extends string>(list: { value: T }[], v: string | undefined): T | undefined => list.find((o) => o.value === v)?.value;

/** Reads the filter from page params (or a plain object). Values that are not valid are left out. */
export function parsePendingPriceFilter(src: ParamSource): PendingPriceFilter {
  const f: PendingPriceFilter = {};
  const q = read(src, "q");
  if (q) f.q = q.slice(0, MAX_FILTER_SEARCH);
  const brandId = read(src, "brandId");
  if (brandId && (brandId === "none" || UUID_RE.test(brandId))) f.brandId = brandId.toLowerCase();
  const categoryId = read(src, "categoryId");
  if (categoryId && UUID_RE.test(categoryId)) f.categoryId = categoryId.toLowerCase();
  const source = oneOf(PRICE_SOURCES, read(src, "source"));
  if (source) f.source = source;
  const change = oneOf(PRICE_CHANGES, read(src, "change"));
  if (change) f.change = change;
  const min = read(src, "min");
  if (min && PRICE_AMOUNT_RE.test(min)) f.min = min;
  const max = read(src, "max");
  if (max && PRICE_AMOUNT_RE.test(max)) f.max = max;
  const batch = read(src, "importBatchId");
  if (batch && UUID_RE.test(batch)) f.importBatchId = batch.toLowerCase();
  const sort = oneOf(PENDING_PRICE_SORTS, read(src, "sort"));
  if (sort) f.sort = sort;
  return f;
}

/** True when anything narrows the list (the sort order does not). */
export function isFiltered(f: PendingPriceFilter): boolean {
  return PENDING_PRICE_FILTER_KEYS.some((k) => k !== "sort" && f[k] !== undefined);
}

export function priceSourceLabel(s: PriceSource): string {
  return PRICE_SOURCES.find((o) => o.value === s)?.label ?? s;
}
