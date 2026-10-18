import { z } from "zod";
import { api } from "@/server/http";
import { setCartDiscount } from "@/server/services/sales";
import { discountSchema } from "@/lib/validation";

const body = z.object({ discount: discountSchema, reason: z.string().max(200).nullable().optional() });
export const PUT = api({ permission: "sales.create" }, async (ctx) => {
  const { discount, reason } = await ctx.body(body);
  return setCartDiscount(ctx.actor, ctx.params.id, discount ?? null, reason);
});
