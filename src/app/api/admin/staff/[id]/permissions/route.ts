import { z } from "zod";
import { api } from "@/server/http";
import { setPermissionOverrides } from "@/server/services/users";

const body = z.object({ overrides: z.array(z.object({ permission: z.string().max(60), effect: z.enum(["grant", "deny"]) })).max(100) });
export const PUT = api({}, async (ctx) => {
  await setPermissionOverrides(ctx.actor, ctx.params.id, (await ctx.body(body)).overrides);
  return { ok: true };
});
