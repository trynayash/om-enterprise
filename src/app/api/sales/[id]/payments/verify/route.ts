import { z } from "zod";
import { api } from "@/server/http";
import { recordVerifiedPayment } from "@/server/services/payments";
import { moneyStr } from "@/lib/validation";

const body = z.object({
  method: z.enum(["upi", "cash", "card", "bank_transfer", "cheque"]),
  amount: moneyStr,
  reference: z.string().trim().max(60).nullable().optional(),
  tenderedAmount: moneyStr.nullable().optional(),
  verificationMethod: z.enum(["manual_merchant_app", "manual_bank_statement", "cash_counted", "manual_other"]),
  note: z.string().max(300).nullable().optional(),
  paymentId: z.string().uuid().nullable().optional(),
  confirmReceived: z.boolean(),
});
export const POST = api({ permission: "payments.verify" }, async (ctx) => recordVerifiedPayment(ctx.actor, ctx.params.id, await ctx.body(body)));
