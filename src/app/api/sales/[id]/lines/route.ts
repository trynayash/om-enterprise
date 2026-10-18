import { z } from "zod";
import { api } from "@/server/http";
import { addLine } from "@/server/services/sales";
import { qtyStr, uuid } from "@/lib/validation";

const body = z.object({ variantId: uuid, quantity: qtyStr, unitCode: z.string().max(20).optional() });
export const POST = api({ permission: "sales.create" }, async (ctx) => addLine(ctx.actor, ctx.params.id, await ctx.body(body)));
