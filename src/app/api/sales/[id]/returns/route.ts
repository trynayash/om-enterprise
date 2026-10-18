import { z } from "zod";
import { api } from "@/server/http";
import { createReturn } from "@/server/services/documents";
import { moneyStr, qtyStr, uuid } from "@/lib/validation";

const body = z.object({
  lines: z.array(z.object({ saleLineId: uuid, quantity: qtyStr })).min(1).max(100),
  reason: z.string().trim().min(3).max(300),
  refund: z
    .object({ method: z.enum(["cash", "upi", "bank_transfer", "card", "cheque"]), reference: z.string().max(60).nullable().optional(), amount: moneyStr.nullable().optional() })
    .nullable()
    .optional(),
});
export const POST = api({ permission: "documents.credit_note" }, async (ctx) => createReturn(ctx.actor, ctx.params.id, await ctx.body(body)));
