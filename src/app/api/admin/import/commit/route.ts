import { z } from "zod";
import { api } from "@/server/http";
import { commitImport } from "@/server/services/import";

const body = z.object({ csv: z.string().min(1).max(5_000_000) });
export const POST = api({ permission: "catalog.import", maxBodyBytes: 6_000_000 }, async (ctx) => commitImport(ctx.actor, (await ctx.body(body)).csv));
