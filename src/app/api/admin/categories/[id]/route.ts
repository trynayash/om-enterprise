import { api } from "@/server/http";
import { updateCategory } from "@/server/services/catalog";
import { categoryInput } from "@/lib/validation";

export const PATCH = api({ permission: "catalog.edit" }, async (ctx) => updateCategory(ctx.actor, ctx.params.id, await ctx.body(categoryInput.partial())));
