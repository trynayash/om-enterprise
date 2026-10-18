import { z } from "zod";
import { api } from "@/server/http";
import { setProductReview } from "@/server/services/catalog";

const body = z.object({ status: z.enum(["draft", "pending_review", "approved"]) });
export const POST = api({ permission: ["catalog.edit", "catalog.publish"] }, async (ctx) => {
  await setProductReview(ctx.actor, ctx.params.id, (await ctx.body(body)).status);
  return { ok: true };
});
