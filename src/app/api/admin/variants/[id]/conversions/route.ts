import { z } from "zod";
import { api } from "@/server/http";
import { addUnitConversion } from "@/server/services/catalog";

const body = z.object({ unitCode: z.string().min(1).max(20), factor: z.string().regex(/^\d{1,8}(\.\d{1,6})?$/) });
export const POST = api({ permission: "catalog.edit" }, async (ctx) => {
  const b = await ctx.body(body);
  return addUnitConversion(ctx.actor, ctx.params.id, b.unitCode, b.factor);
});
