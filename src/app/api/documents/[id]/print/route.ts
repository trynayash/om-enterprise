import { api } from "@/server/http";
import { recordPrint } from "@/server/services/documents";

export const POST = api({ permission: ["documents.reprint", "documents.issue"] }, async ({ actor, params }) => {
  await recordPrint(actor, params.id, "print");
  return { ok: true };
});
