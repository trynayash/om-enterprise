import { api } from "@/server/http";
import { submitWebsiteOrder } from "@/server/services/website-orders";
import { websiteOrderInput } from "@/lib/validation";

export const POST = api({ public: true }, async (ctx) => {
  const input = await ctx.body(websiteOrderInput);
  return submitWebsiteOrder(input, ctx.client.ip);
});
