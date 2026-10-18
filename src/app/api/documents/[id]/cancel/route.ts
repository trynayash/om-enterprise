import { z } from "zod";
import { api } from "@/server/http";
import { cancelBill } from "@/server/services/documents";

const body = z.object({
  reason: z.string().trim().min(5).max(300),
  refund: z.object({ method: z.enum(["cash", "upi", "bank_transfer", "card", "cheque"]), reference: z.string().max(60).nullable().optional() }).nullable().optional(),
});
export const POST = api({ permission: "documents.cancel" }, async (ctx) => {
  await cancelBill(ctx.actor, ctx.params.id, await ctx.body(body));
  return { ok: true };
});
