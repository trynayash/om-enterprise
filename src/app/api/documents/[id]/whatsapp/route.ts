import { z } from "zod";
import { api } from "@/server/http";
import { whatsappDocument } from "@/server/services/document-whatsapp";

/** Send the bill on WhatsApp from the shop's number to the customer's number on it, or to one typed at the counter. */
const body = z.object({ to: z.string().trim().max(20).nullable().optional(), saveToCustomer: z.boolean().optional() });
export const POST = api({ permission: "documents.share" }, async (ctx) => whatsappDocument(ctx.actor, ctx.params.id, await ctx.body(body)));
