import { z } from "zod";
import { api } from "@/server/http";
import { setShareLink } from "@/server/services/documents";

const body = z.object({ enabled: z.boolean() });
export const POST = api({ permission: "documents.share" }, async (ctx) => ({ token: await setShareLink(ctx.actor, ctx.params.id, (await ctx.body(body)).enabled) }));
