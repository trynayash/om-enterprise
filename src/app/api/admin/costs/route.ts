import { api } from "@/server/http";
import { recordCost } from "@/server/services/pricing";
import { costInput } from "@/lib/validation";

export const POST = api({ permission: "costs.edit" }, async (ctx) => recordCost(ctx.actor, await ctx.body(costInput)));
