import { z } from "zod";
import { api } from "@/server/http";
import { approveInPerson } from "@/server/services/sales";

const body = z.object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(200), note: z.string().max(300).nullable().optional() });
export const POST = api({ permission: "sales.create" }, async (ctx) => {
  const b = await ctx.body(body);
  return approveInPerson(ctx.actor, ctx.params.id, b.username, b.password, b.note ?? null, ctx.client);
});
