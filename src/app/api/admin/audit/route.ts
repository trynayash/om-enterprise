import { api } from "@/server/http";
import { queryAudit } from "@/server/services/audit-log";
import { intParam, optionalDate } from "@/server/route-helpers";

export const GET = api({ permission: "audit.view" }, async ({ actor, query }) =>
  queryAudit(actor, {
    q: query.get("q") ?? undefined,
    action: query.get("action") ?? undefined,
    entityType: query.get("entityType") ?? undefined,
    entityId: query.get("entityId") ?? undefined,
    actorUserId: query.get("actor") ?? undefined,
    from: optionalDate(query, "from"),
    to: optionalDate(query, "to"),
    page: intParam(query, "page", 1),
    pageSize: intParam(query, "pageSize", 100),
  }),
);
