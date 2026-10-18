import { z } from "zod";
import { api } from "@/server/http";
import { createStaff, listStaff } from "@/server/services/users";
import { percentStr } from "@/lib/validation";

export const GET = api({ permission: "users.manage" }, async ({ actor }) => listStaff(actor));

const body = z.object({
  username: z.string().trim().min(3).max(40),
  displayName: z.string().trim().min(2).max(80),
  mobile: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().max(120).nullable().optional(),
  roleKey: z.string().min(1).max(40),
  temporaryPassword: z.string().min(1).max(200),
  discountLimitPercent: percentStr.nullable().optional(),
  approvalLimitPercent: percentStr.nullable().optional(),
});
export const POST = api({ permission: "users.manage" }, async (ctx) => createStaff(ctx.actor, await ctx.body(body)));
