import { z } from "zod";
import { api } from "@/server/http";
import { issueBill } from "@/server/services/documents";
import { customerInput } from "@/lib/validation";

const body = z.object({
  customer: customerInput.extend({ id: z.string().uuid().nullable().optional() }).nullable().optional(),
  allowOutstanding: z.boolean().optional(),
});
export const POST = api({ permission: "documents.issue" }, async (ctx) => issueBill(ctx.actor, ctx.params.id, await ctx.body(body)));
