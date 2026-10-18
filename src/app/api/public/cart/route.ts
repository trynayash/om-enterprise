import { z } from "zod";
import { api } from "@/server/http";
import { pricePublicCart } from "@/server/services/public-catalog";
import { qtyStr, uuid } from "@/lib/validation";

const body = z.object({ items: z.array(z.object({ variantId: uuid, quantity: qtyStr })).max(50) });

/** Re-price the visitor's enquiry cart server-side (client prices are never trusted). */
export const POST = api({ public: true }, async (ctx) => {
  const { items } = await ctx.body(body);
  return pricePublicCart(items);
});
