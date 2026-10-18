import { z } from "zod";
import { api } from "@/server/http";
import { cancelScheduledPrice } from "@/server/services/pricing";

const body = z.object({ reason: z.string().trim().min(3).max(300) });
export const POST = api({ permission: "prices.approve" }, async (ctx) => {
  await cancelScheduledPrice(ctx.actor, ctx.params.id, (await ctx.body(body)).reason);
  return { ok: true };
});
