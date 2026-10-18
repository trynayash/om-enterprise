import { api } from "@/server/http";
import { updateBrand } from "@/server/services/catalog";
import { brandInput } from "@/lib/validation";

export const PATCH = api({ permission: "catalog.edit" }, async (ctx) => updateBrand(ctx.actor, ctx.params.id, await ctx.body(brandInput.partial())));
