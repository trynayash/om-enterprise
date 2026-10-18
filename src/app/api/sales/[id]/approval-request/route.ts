import { z } from "zod";
import { api } from "@/server/http";
import { requestApproval } from "@/server/services/sales";

const body = z.object({ reason: z.string().trim().min(3).max(300) });
export const POST = api({ permission: "sales.create" }, async (ctx) => requestApproval(ctx.actor, ctx.params.id, (await ctx.body(body)).reason));
