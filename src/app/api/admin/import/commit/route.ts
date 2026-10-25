import { z } from "zod";
import { api } from "@/server/http";
import { commitImport } from "@/server/services/import";

// Photo links are downloaded after the import is saved, which can take a while for a big file.
export const maxDuration = 120;

const body = z.object({ csv: z.string().min(1).max(5_000_000), publish: z.boolean().optional() });
export const POST = api({ permission: "catalog.import", maxBodyBytes: 6_000_000 }, async (ctx) => {
  const { csv, publish } = await ctx.body(body);
  return commitImport(ctx.actor, csv, { publish });
});
