import { z } from "zod";
import { api } from "@/server/http";
import { setProductPublished } from "@/server/services/catalog";

const body = z.object({ publish: z.boolean() });
export const POST = api({ permission: "catalog.publish" }, async (ctx) => {
  await setProductPublished(ctx.actor, ctx.params.id, (await ctx.body(body)).publish);
  return { ok: true };
});
