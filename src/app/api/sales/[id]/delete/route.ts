import { z } from "zod";
import { api } from "@/server/http";
import { deleteSale } from "@/server/services/sales";

// Super Admin only (checked in the service), confirmed with the delete phrase.
const body = z.object({ confirm: z.string().trim().min(1).max(100), reason: z.string().trim().max(300).nullable().optional() });
export const POST = api({}, async (ctx) => deleteSale(ctx.actor, ctx.params.id, await ctx.body(body)));
