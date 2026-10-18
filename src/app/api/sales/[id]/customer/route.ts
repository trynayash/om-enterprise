import { z } from "zod";
import { api } from "@/server/http";
import { attachCustomer } from "@/server/services/sales";

const body = z.object({ customerId: z.string().uuid().nullable() });
export const POST = api({ permission: "sales.create" }, async (ctx) => {
  await attachCustomer(ctx.actor, ctx.params.id, (await ctx.body(body)).customerId);
  return { ok: true };
});
