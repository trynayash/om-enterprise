import { z } from "zod";
import { api } from "@/server/http";
import { decidePriceChange } from "@/server/services/pricing";

const body = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().max(300).nullable().optional() });
export const POST = api({ permission: "prices.approve" }, async (ctx) => {
  const b = await ctx.body(body);
  return decidePriceChange(ctx.actor, ctx.params.id, b.decision, b.note ?? undefined);
});
