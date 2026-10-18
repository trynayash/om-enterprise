import { api } from "@/server/http";
import { listDocuments } from "@/server/services/documents";
import { intParam, optionalDate } from "@/server/route-helpers";
import type { DocType } from "@/lib/document-types";

export const GET = api({ permission: ["documents.reprint", "documents.issue", "sales.view_all"] }, async ({ actor, query }) => {
  const status = query.get("status");
  return listDocuments(actor, {
    q: query.get("q") ?? undefined,
    docType: (query.get("type") as DocType | null) ?? undefined,
    status: status === "issued" || status === "cancelled" ? status : undefined,
    from: optionalDate(query, "from"),
    to: optionalDate(query, "to"),
    includeTraining: query.get("training") === "1",
    page: intParam(query, "page", 1),
    pageSize: intParam(query, "pageSize", 50),
  });
});
