import { z } from "zod";
import { api } from "@/server/http";
import { markPaymentFailed } from "@/server/services/payments";

const body = z.object({ status: z.enum(["failed", "cancelled", "expired"]), reason: z.string().trim().min(3).max(200) });
export const POST = api({ permission: "payments.record" }, async (ctx) => {
  const b = await ctx.body(body);
  await markPaymentFailed(ctx.actor, ctx.params.id, b.status, b.reason);
  return { ok: true };
});
