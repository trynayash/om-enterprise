import { api } from "@/server/http";
import { proposePrice } from "@/server/services/pricing";
import { priceInput } from "@/lib/validation";

export const POST = api({ permission: "prices.edit" }, async (ctx) => proposePrice(ctx.actor, await ctx.body(priceInput)));
