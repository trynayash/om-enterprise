import { after } from "next/server";
import { z } from "zod";
import { api } from "@/server/http";
import { requestApproval } from "@/server/services/sales";
import { notifyApprovalRequest } from "@/server/services/owner";

const body = z.object({ reason: z.string().trim().min(3).max(300) });
export const POST = api({ permission: "sales.create" }, async (ctx) => {
  const req = await requestApproval(ctx.actor, ctx.params.id, (await ctx.body(body)).reason);
  // The owner hears about it by email (when turned on), after the counter has its answer.
  after(() => notifyApprovalRequest(req, ctx.actor.displayName));
  return req;
});
