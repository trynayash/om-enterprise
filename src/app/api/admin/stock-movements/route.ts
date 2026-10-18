import { z } from "zod";
import { api } from "@/server/http";
import { recordStockMovement } from "@/server/services/inventory";
import { costStr } from "@/lib/validation";

const body = z.object({
  variantId: z.string().uuid(),
  quantityChange: z.string().regex(/^-?\d{1,9}(\.\d{1,3})?$/),
  movementType: z.enum(["opening", "adjustment", "damage", "purchase_receipt", "supplier_return"]),
  note: z.string().trim().min(3).max(300),
  unitCost: costStr.nullable().optional(),
});
export const POST = api({ permission: "inventory.manage" }, async (ctx) => recordStockMovement(ctx.actor, await ctx.body(body)));
