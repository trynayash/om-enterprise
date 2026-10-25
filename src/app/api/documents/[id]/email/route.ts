import { z } from "zod";
import { api } from "@/server/http";
import { emailDocument } from "@/server/services/document-email";

/** Email the bill to the customer's address on it, or to one typed at the counter. */
const body = z.object({ to: z.string().trim().max(254).nullable().optional(), saveToCustomer: z.boolean().optional() });
export const POST = api({ permission: "documents.share" }, async (ctx) => emailDocument(ctx.actor, ctx.params.id, await ctx.body(body)));
