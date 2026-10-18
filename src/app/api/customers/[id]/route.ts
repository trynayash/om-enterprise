import { api } from "@/server/http";
import { getCustomer, updateCustomer } from "@/server/services/customers";
import { customerInput } from "@/lib/validation";

export const GET = api({ permission: ["customers.view", "sales.create"] }, async ({ actor, params }) => getCustomer(actor, params.id));
export const PATCH = api({ permission: ["customers.edit", "sales.create"] }, async (ctx) => updateCustomer(ctx.actor, ctx.params.id, await ctx.body(customerInput)));
