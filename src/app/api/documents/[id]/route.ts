import { api } from "@/server/http";
import { getDocument } from "@/server/services/documents";

export const GET = api({ permission: ["documents.reprint", "documents.issue", "sales.view_all"] }, async ({ actor, params }) => getDocument(actor, params.id));
