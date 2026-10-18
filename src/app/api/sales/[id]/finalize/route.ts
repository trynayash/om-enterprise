import { api } from "@/server/http";
import { finalizeSale } from "@/server/services/sales";

export const POST = api({ permission: "sales.create" }, async (ctx) => finalizeSale(ctx.actor, ctx.params.id));
