import { z } from "zod";
import { api } from "@/server/http";
import { listSuppliers, saveSupplier } from "@/server/services/inventory";

export const GET = api({ permission: ["inventory.view", "inventory.manage", "costs.edit"] }, async ({ actor }) => listSuppliers(actor));
const body = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  gstin: z.string().max(20).nullable().optional(),
  mobile: z.string().max(20).nullable().optional(),
  email: z.string().max(120).nullable().optional(),
  address: z.string().max(400).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});
export const POST = api({ permission: "inventory.manage" }, async (ctx) => saveSupplier(ctx.actor, await ctx.body(body)));
