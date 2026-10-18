import { z } from "zod";
import { api } from "@/server/http";
import { getSale, refreshDraft, setSaleOptions } from "@/server/services/sales";

export const GET = api({ permission: ["sales.create", "sales.view_all", "payments.view"] }, async ({ actor, params, query }) => {
  const evaluation = query.get("refresh") === "1" ? await refreshDraft(actor, params.id) : null;
  return { ...(await getSale(actor, params.id)), evaluation };
});

const body = z.object({
  placeOfSupplyStateCode: z.string().regex(/^\d{2}$/).optional(),
  priceListId: z.string().uuid().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export const PATCH = api({ permission: "sales.create" }, async (ctx) => setSaleOptions(ctx.actor, ctx.params.id, await ctx.body(body)));
