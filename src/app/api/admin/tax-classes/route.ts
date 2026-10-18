import { z } from "zod";
import { api } from "@/server/http";
import { createTaxClass, listTaxClasses } from "@/server/services/catalog";
import { rateStr } from "@/lib/validation";

const body = z.object({ name: z.string().trim().min(2).max(60), gstRate: rateStr, cessRate: rateStr.optional(), isExempt: z.boolean().optional(), description: z.string().max(300).nullable().optional() });
export const GET = api({ permission: ["catalog.view", "settings.tax"] }, async () => listTaxClasses());
export const POST = api({ permission: "settings.tax" }, async (ctx) => createTaxClass(ctx.actor, await ctx.body(body)));
