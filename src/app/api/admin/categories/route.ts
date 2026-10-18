import { api } from "@/server/http";
import { createCategory, listCategories } from "@/server/services/catalog";
import { categoryInput } from "@/lib/validation";

export const GET = api({ permission: ["catalog.view", "catalog.edit"] }, async () => listCategories());
export const POST = api({ permission: "catalog.create" }, async (ctx) => createCategory(ctx.actor, await ctx.body(categoryInput)));
