import { z } from "zod";
import { api } from "@/server/http";
import { resetStaffPassword } from "@/server/services/users";

const body = z.object({ temporaryPassword: z.string().min(1).max(200) });
export const POST = api({ permission: "users.manage" }, async (ctx) => {
  await resetStaffPassword(ctx.actor, ctx.params.id, (await ctx.body(body)).temporaryPassword);
  return { ok: true };
});
