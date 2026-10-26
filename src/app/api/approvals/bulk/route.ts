import { z } from "zod";
import { api } from "@/server/http";
import { decideApprovals } from "@/server/services/sales";

const body = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(300).nullable().optional(),
  ids: z.array(z.uuid()).min(1).max(100),
});

/** Approve or reject the discount requests shown on the Approvals page; each is checked on its own. */
export const POST = api({ permission: "discounts.approve" }, async (ctx) => {
  const b = await ctx.body(body);
  return decideApprovals(ctx.actor, { decision: b.decision, note: b.note ?? null, ids: b.ids });
});
