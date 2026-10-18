import { z } from "zod";
import { api } from "@/server/http";
import { decideApproval } from "@/server/services/sales";

const body = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().max(300).nullable().optional() });
export const POST = api({ permission: "discounts.approve" }, async (ctx) => {
  const b = await ctx.body(body);
  return decideApproval(ctx.actor, ctx.params.id, b.decision, b.note ?? null);
});
