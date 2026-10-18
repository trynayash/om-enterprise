import { api } from "@/server/http";
import { getProductAdmin, updateProduct } from "@/server/services/catalog";
import { productInput } from "@/lib/validation";

export const GET = api({ permission: ["catalog.view", "catalog.edit"] }, async ({ actor, params }) => getProductAdmin(actor, params.id));
export const PATCH = api({ permission: "catalog.edit" }, async (ctx) => updateProduct(ctx.actor, ctx.params.id, await ctx.body(productInput.partial())));
