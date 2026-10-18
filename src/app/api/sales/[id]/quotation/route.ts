import { z } from "zod";
import { api } from "@/server/http";
import { issueQuotation } from "@/server/services/documents";
import { customerInput } from "@/lib/validation";

const body = z.object({ customer: customerInput.extend({ id: z.string().uuid().nullable().optional() }).nullable().optional() });
export const POST = api({ permission: "sales.create" }, async (ctx) => {
  const { customer } = await ctx.body(body);
  return issueQuotation(ctx.actor, ctx.params.id, customer);
});
