import { z } from "zod";
import { api } from "@/server/http";
import { reversePayment } from "@/server/services/payments";

const body = z.object({ reason: z.string().trim().min(5).max(300) });
export const POST = api({ permission: "payments.reverse" }, async (ctx) => reversePayment(ctx.actor, ctx.params.id, (await ctx.body(body)).reason));
