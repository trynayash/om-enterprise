import { api } from "@/server/http";
import { createBrand, listBrands } from "@/server/services/catalog";
import { brandInput } from "@/lib/validation";

export const GET = api({ permission: ["catalog.view", "catalog.edit"] }, async () => listBrands());
export const POST = api({ permission: "catalog.create" }, async (ctx) => createBrand(ctx.actor, await ctx.body(brandInput)));
