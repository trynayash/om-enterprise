import { z } from "zod";
import { api } from "@/server/http";
import { getWebsiteOrder, updateWebsiteOrder } from "@/server/services/website-orders";

export const GET = api({ permission: "orders.view" }, async ({ actor, params }) => getWebsiteOrder(actor, params.id));
const body = z.object({ status: z.enum(["new", "contacted", "quoted", "closed", "spam"]).optional(), staffNotes: z.string().max(1000).nullable().optional() });
export const PATCH = api({ permission: "orders.manage" }, async (ctx) => {
  await updateWebsiteOrder(ctx.actor, ctx.params.id, await ctx.body(body));
  return { ok: true };
});
