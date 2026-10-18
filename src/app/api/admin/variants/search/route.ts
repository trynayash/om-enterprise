import { api } from "@/server/http";
import { searchSellable } from "@/server/services/catalog";
import { intParam } from "@/server/route-helpers";

/** Variant picker for catalogue screens (compatibility links, stock movements). */
export const GET = api({ permission: ["catalog.view", "catalog.edit"] }, async ({ actor, query }) =>
  (await searchSellable(actor, { q: query.get("q")?.slice(0, 100) ?? undefined, limit: intParam(query, "limit", 20) })).map((v) => ({
    variantId: v.variantId,
    productId: v.productId,
    productName: v.productName,
    variantName: v.variantName,
    sku: v.sku,
    brandName: v.brandName,
    categoryName: v.categoryName,
    unitCode: v.unitCode,
    isSample: v.isSample,
  })),
);
