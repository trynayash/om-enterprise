/** Serializable shapes passed from catalogue server pages to client components. */
import { D, type Dec } from "@/lib/money";
import { grossMarginPercent, markupPercent, toTaxExclusive } from "@/lib/pricing/engine";

export type RegType = "regular" | "composition" | "unregistered" | null;

export interface Option {
  id: string;
  name: string;
}
export interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
}
export interface UnitOption {
  code: string;
  name: string;
  decimals: number;
  uqc: string;
}
export interface TaxOption {
  id: string;
  name: string;
  gstRate: string;
  cessRate: string;
  isExempt: boolean;
  isActive: boolean;
}
export interface PriceListOption {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface ProductDetails {
  id: string;
  slug: string;
  name: string;
  brandId: string | null;
  categoryId: string;
  manufacturer: string | null;
  model: string | null;
  description: string | null;
  specifications: { label: string; value: string }[];
  variantAttributes: string[];
  warrantyInfo: string | null;
  hsnCode: string | null;
  taxClassId: string | null;
  unitCode: string;
  discountEligible: boolean;
  isActive: boolean;
  isPublished: boolean;
  isFeatured: boolean;
  isSample: boolean;
  reviewStatus: "draft" | "pending_review" | "approved";
  sourceInfo: string | null;
  updatedAt: string;
}

export interface VariantRow {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  attributes: Record<string, string>;
  unitCode: string;
  taxClassId: string | null;
  discountEligible: boolean | null;
  targetMarginPercent: string | null;
  minMarginPercent: string | null;
  isActive: boolean;
  sortOrder: number;
  reorderLevel: string | null;
}

export interface PriceVersionDTO {
  id: string;
  variantId: string;
  priceListId: string;
  price: string;
  priceIncludesTax: boolean;
  mrp: string | null;
  tiers: { minQty: string; price: string }[];
  effectiveFrom: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason: string;
  previousPrice: string | null;
  createdAt: string;
  landedCostSnapshot: string | null;
  marginPercentSnapshot: string | null;
}

export interface CostDTO {
  id: string;
  purchaseCost: string;
  purchaseTaxRate: string;
  freight: string;
  handling: string;
  otherCosts: string;
  itcPolicy: "recoverable" | "non_recoverable";
  landedCost: string;
  effectiveFrom: string;
  sourceRef: string | null;
}

export interface PricingContextDTO {
  gstRate: string;
  cessRate: string;
  isExempt: boolean;
  minMarginPercent: string | null;
  targetMarginPercent: string | null;
  discountEligible: boolean;
}

export interface ImageDTO {
  id: string;
  url: string;
  alt: string | null;
  variantId: string | null;
  sortOrder: number;
}

export interface ConversionDTO {
  id: string;
  variantId: string;
  unitCode: string;
  factor: string;
}

export interface CompatDTO {
  a: string;
  b: string;
  note: string | null;
}

export interface CompatVariantDTO {
  id: string;
  sku: string;
  name: string;
  productName: string;
  productId: string;
}

export interface SupplierOption {
  id: string;
  name: string;
}

export interface CatalogPermissions {
  canEdit: boolean;
  canCreate: boolean;
  canPublish: boolean;
  canEditPrices: boolean;
  canApprovePrices: boolean;
  canSeeCosts: boolean;
  canEditCosts: boolean;
  canConfigureMargins: boolean;
}

/**
 * Tax-exclusive revenue per unit for margin maths. Matches the server rule in pricing.ts:
 * only a regular GST registration collects output tax; otherwise the whole price is revenue.
 */
export function exclusiveRevenue(price: string, includesTax: boolean, gstRate: string, cessRate: string, regType: RegType): Dec {
  return regType === "regular" ? toTaxExclusive(price, includesTax, gstRate, cessRate) : D(price);
}

export interface MarginInfo {
  exclusive: Dec;
  margin: Dec | null;
  markup: Dec | null;
  belowCost: boolean;
  belowFloor: boolean;
}

export function marginInfo(
  price: string,
  includesTax: boolean,
  ctx: Pick<PricingContextDTO, "gstRate" | "cessRate" | "minMarginPercent">,
  landedCost: string | null,
  regType: RegType,
): MarginInfo {
  const exclusive = exclusiveRevenue(price, includesTax, ctx.gstRate, ctx.cessRate, regType);
  if (!landedCost) return { exclusive, margin: null, markup: null, belowCost: false, belowFloor: false };
  const margin = grossMarginPercent(exclusive, landedCost);
  const markup = markupPercent(exclusive, landedCost);
  const belowCost = exclusive.lessThan(D(landedCost));
  const belowFloor = !!ctx.minMarginPercent && margin !== null && margin.lessThan(D(ctx.minMarginPercent));
  return { exclusive, margin, markup, belowCost, belowFloor };
}

export function isoOrNull(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return typeof d === "string" ? d : d.toISOString();
}

/** Categories ordered as a tree: parents first, children indented after their parent. */
export function categoryTree<T extends CategoryOption>(cats: T[]): (T & { depth: number })[] {
  const byParent = new Map<string | null, T[]>();
  for (const c of cats) {
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const out: (T & { depth: number })[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const c of byParent.get(parent) ?? []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ ...c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  // Orphans (parent missing) appended at root level
  for (const c of cats) if (!seen.has(c.id)) out.push({ ...c, depth: 0 });
  return out;
}

/** A category and every category under it, at any depth (for "in this category" filters). */
export function categoryWithDescendants(cats: { id: string; parentId: string | null }[], rootId: string): string[] {
  const byParent = new Map<string, string[]>();
  for (const c of cats) if (c.parentId) byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c.id]);
  const out: string[] = [];
  const seen = new Set<string>();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    queue.push(...(byParent.get(id) ?? []));
  }
  return out;
}
