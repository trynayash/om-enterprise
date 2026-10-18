import { api } from "@/server/http";
import { createVariant } from "@/server/services/catalog";
import { variantInput } from "@/lib/validation";

export const POST = api({ permission: "catalog.create" }, async (ctx) => createVariant(ctx.actor, ctx.params.id, await ctx.body(variantInput)));
