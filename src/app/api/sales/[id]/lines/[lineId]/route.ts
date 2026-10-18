import { z } from "zod";
import { api } from "@/server/http";
import { removeLine, updateLine } from "@/server/services/sales";
import { discountSchema, moneyStr, qtyStr } from "@/lib/validation";

const body = z.object({
  quantity: qtyStr.optional(),
  discount: discountSchema,
  discountReason: z.string().max(200).nullable().optional(),
  overridePrice: moneyStr.nullable().optional(),
  overrideReason: z.string().max(200).nullable().optional(),
});
export const PATCH = api({ permission: "sales.create" }, async (ctx) => updateLine(ctx.actor, ctx.params.id, ctx.params.lineId, await ctx.body(body)));
export const DELETE = api({ permission: "sales.create" }, async (ctx) => removeLine(ctx.actor, ctx.params.id, ctx.params.lineId));
