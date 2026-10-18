import { z } from "zod";
import { api } from "@/server/http";
import { addCharge } from "@/server/services/sales";
import { moneyStr, rateStr } from "@/lib/validation";

const body = z.object({
  label: z.string().trim().min(2).max(80),
  amount: moneyStr,
  gstRate: rateStr,
  priceIncludesTax: z.boolean(),
  sacCode: z.string().regex(/^\d{4,8}$/).nullable().optional(),
});
export const POST = api({ permission: "sales.create" }, async (ctx) => addCharge(ctx.actor, ctx.params.id, await ctx.body(body)));
