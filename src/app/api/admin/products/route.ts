import { api } from "@/server/http";
import { createProduct, listProductsAdmin, type AdminProductFilter } from "@/server/services/catalog";
import { productInput } from "@/lib/validation";
import { intParam } from "@/server/route-helpers";

export const GET = api({ permission: ["catalog.view", "catalog.edit"] }, async ({ actor, query }) =>
  listProductsAdmin(actor, {
    q: query.get("q") ?? undefined,
    categoryId: query.get("categoryId") ?? undefined,
    brandId: query.get("brandId") ?? undefined,
    status: (query.get("status") as AdminProductFilter["status"]) ?? "all",
    page: intParam(query, "page", 1),
    pageSize: intParam(query, "pageSize", 50),
  }),
);
export const POST = api({ permission: "catalog.create" }, async (ctx) => createProduct(ctx.actor, await ctx.body(productInput)));
