import { z } from "zod";
import { api } from "@/server/http";
import { listActiveSessions, updateStaff } from "@/server/services/users";
import { percentStr } from "@/lib/validation";

const body = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  mobile: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().max(120).nullable().optional(),
  isActive: z.boolean().optional(),
  roleKey: z.string().min(1).max(40).optional(),
  discountLimitPercent: percentStr.nullable().optional(),
  approvalLimitPercent: percentStr.nullable().optional(),
});
export const PATCH = api({ permission: "users.manage" }, async (ctx) => updateStaff(ctx.actor, ctx.params.id, await ctx.body(body)));
export const GET = api({ permission: "users.manage" }, async ({ actor, params }) => ({ sessions: await listActiveSessions(actor, params.id) }));
