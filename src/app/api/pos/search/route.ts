import { api } from "@/server/http";
import { searchSellable } from "@/server/services/catalog";
import { intParam } from "@/server/route-helpers";

export const GET = api({ permission: "sales.create" }, async ({ actor, query }) =>
  searchSellable(actor, {
    q: query.get("q")?.slice(0, 100) ?? undefined,
    categoryId: query.get("categoryId") ?? undefined,
    priceListId: query.get("priceListId") ?? undefined,
    limit: intParam(query, "limit", 40),
  }),
);
