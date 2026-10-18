import { api } from "@/server/http";
import { createCustomer, listCustomers, searchCustomers } from "@/server/services/customers";
import { customerInput } from "@/lib/validation";
import { intParam } from "@/server/route-helpers";

export const GET = api({ permission: ["customers.view", "sales.create"] }, async ({ actor, query }) => {
  if (query.get("view") === "list") return listCustomers(actor, query.get("q") ?? undefined, intParam(query, "page", 1));
  return searchCustomers(actor, query.get("q") ?? "", Math.min(intParam(query, "limit", 20), 50));
});
export const POST = api({ permission: ["customers.edit", "sales.create"] }, async (ctx) => createCustomer(ctx.actor, await ctx.body(customerInput)));
