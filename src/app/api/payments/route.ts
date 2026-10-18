import { api } from "@/server/http";
import { listPayments, pendingPayments } from "@/server/services/payments";
import { intParam, optionalDate } from "@/server/route-helpers";

export const GET = api({ permission: ["payments.view", "payments.record"] }, async ({ actor, query }) => {
  if (query.get("view") === "pending") return pendingPayments(actor);
  const direction = query.get("direction");
  return listPayments(actor, {
    q: query.get("q") ?? undefined,
    status: query.get("status") ?? undefined,
    method: query.get("method") ?? undefined,
    direction: direction === "in" || direction === "refund" ? direction : undefined,
    from: optionalDate(query, "from"),
    to: optionalDate(query, "to"),
    includeTraining: query.get("training") === "1",
    page: intParam(query, "page", 1),
    pageSize: intParam(query, "pageSize", 50),
  });
});
