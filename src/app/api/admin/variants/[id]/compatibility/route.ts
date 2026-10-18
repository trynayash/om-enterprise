import { z } from "zod";
import { api } from "@/server/http";
import { linkCompatibility, unlinkCompatibility } from "@/server/services/catalog";

const body = z.object({ otherVariantId: z.string().uuid(), note: z.string().max(200).nullable().optional() });
export const POST = api({ permission: "catalog.edit" }, async (ctx) => {
  const b = await ctx.body(body);
  await linkCompatibility(ctx.actor, ctx.params.id, b.otherVariantId, b.note ?? null);
  return { ok: true };
});
export const DELETE = api({ permission: "catalog.edit" }, async (ctx) => {
  const b = await ctx.body(body);
  await unlinkCompatibility(ctx.actor, ctx.params.id, b.otherVariantId);
  return { ok: true };
});
