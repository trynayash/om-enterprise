import { z } from "zod";
import { api } from "@/server/http";
import { saveSaleCustomer } from "@/server/services/documents";
import { attachCustomer } from "@/server/services/sales";
import { customerInput } from "@/lib/validation";

/** Either a saved customer's id, or the details typed at the counter (null for a walk-in with none). */
const body = z.union([z.object({ customerId: z.string().uuid().nullable() }), z.object({ customer: customerInput.extend({ id: z.string().uuid().nullable().optional() }).nullable() })]);
export const POST = api({ permission: "sales.create" }, async (ctx) => {
  const b = await ctx.body(body);
  if ("customerId" in b) {
    await attachCustomer(ctx.actor, ctx.params.id, b.customerId);
    return { ok: true, customerId: b.customerId };
  }
  const customer = await saveSaleCustomer(ctx.actor, ctx.params.id, b.customer);
  return { ok: true, customerId: customer?.id ?? null };
});
