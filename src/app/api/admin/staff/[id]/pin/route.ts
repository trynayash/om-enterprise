import { z } from "zod";
import { api } from "@/server/http";
import { clearStaffPin, setStaffPin } from "@/server/services/users";

const body = z.object({ pin: z.string().trim().min(1).max(12) });

/** Set or change a counter staff member's sign-in PIN. */
export const PUT = api({ permission: "users.manage" }, async (ctx) => {
  await setStaffPin(ctx.actor, ctx.params.id, (await ctx.body(body)).pin);
  return { ok: true };
});

/** Remove it: they sign in with their password again. */
export const DELETE = api({ permission: "users.manage" }, async (ctx) => {
  await clearStaffPin(ctx.actor, ctx.params.id);
  return { ok: true };
});
