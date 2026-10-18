import { api } from "@/server/http";
import { updateVariant } from "@/server/services/catalog";
import { variantInput } from "@/lib/validation";

export const PATCH = api({ permission: "catalog.edit" }, async (ctx) => updateVariant(ctx.actor, ctx.params.id, await ctx.body(variantInput.partial())));
