import { api } from "@/server/http";
import { can } from "@/server/auth/actor";
import { costHistory, priceHistory } from "@/server/services/pricing";

export const GET = api({ permission: ["catalog.view", "prices.edit", "reports.view"] }, async ({ actor, params }) => ({
  prices: await priceHistory(actor, params.id),
  costs: can(actor, "costs.view") ? await costHistory(actor, params.id) : null,
}));
