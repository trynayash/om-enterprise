import { api } from "@/server/http";
import { searchPublicProducts } from "@/server/services/public-catalog";
import { intParam } from "@/server/route-helpers";

export const GET = api({ public: true }, async ({ query }) => {
  const sort = query.get("sort");
  return searchPublicProducts({
    q: query.get("q")?.slice(0, 100) ?? undefined,
    category: query.get("category") ?? undefined,
    brand: query.get("brand") ?? undefined,
    sort: sort === "price_asc" || sort === "price_desc" ? sort : "name",
    page: intParam(query, "page", 1),
    pageSize: Math.min(intParam(query, "pageSize", 24), 60),
  });
});
