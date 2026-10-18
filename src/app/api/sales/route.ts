import { z } from "zod";
import { api } from "@/server/http";
import { createSale, listSales } from "@/server/services/sales";
import { intParam, optionalDate } from "@/server/route-helpers";

export const GET = api({ permission: ["sales.create", "sales.view_all", "payments.view"] }, async ({ actor, query }) =>
  listSales(actor, {
    q: query.get("q") ?? undefined,
    status: query.get("status") ?? undefined,
    paymentStatus: query.get("paymentStatus") ?? undefined,
    from: optionalDate(query, "from"),
    to: optionalDate(query, "to"),
    staffId: query.get("staffId") ?? undefined,
    includeTraining: query.get("training") === "1",
    page: intParam(query, "page", 1),
    pageSize: intParam(query, "pageSize", 30),
  }),
);

const body = z.object({ priceListId: z.string().uuid().optional() });
export const POST = api({ permission: "sales.create" }, async (ctx) => {
  const { priceListId } = await ctx.body(body);
  return createSale(ctx.actor, { priceListId });
});
