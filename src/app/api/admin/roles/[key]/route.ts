import { z } from "zod";
import { api } from "@/server/http";
import { setRolePermissions } from "@/server/services/users";
import { percentStr } from "@/lib/validation";

const body = z.object({ permissions: z.array(z.string().max(60)).max(100), discountLimitPercent: percentStr.optional(), approvalLimitPercent: percentStr.optional() });
export const PUT = api({}, async (ctx) => {
  await setRolePermissions(ctx.actor, ctx.params.key, await ctx.body(body));
  return { ok: true };
});
