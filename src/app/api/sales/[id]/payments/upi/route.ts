import { z } from "zod";
import { api } from "@/server/http";
import { startUpiPayment } from "@/server/services/payments";
import { moneyStr } from "@/lib/validation";

const body = z.object({ amount: moneyStr.nullable().optional() });
export const POST = api({ permission: "payments.record" }, async (ctx) => {
  const p = await startUpiPayment(ctx.actor, ctx.params.id, (await ctx.body(body)).amount);
  return { ...p, qrUrl: p.qrPayload ? `/api/payments/${p.id}/qr` : ((p.providerData as { qrImageUrl?: string } | null)?.qrImageUrl ?? null) };
});
