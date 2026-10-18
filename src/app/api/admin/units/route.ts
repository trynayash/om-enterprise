import { z } from "zod";
import { api } from "@/server/http";
import { createUnit, listUnits } from "@/server/services/catalog";

const body = z.object({ code: z.string().trim().min(1).max(20), name: z.string().trim().min(1).max(40), uqc: z.string().trim().regex(/^[A-Z]{3}$/), decimals: z.number().int().min(0).max(3) });
export const GET = api({ permission: ["catalog.view", "sales.create"] }, async () => listUnits());
export const POST = api({ permission: "catalog.create" }, async (ctx) => createUnit(ctx.actor, await ctx.body(body)));
