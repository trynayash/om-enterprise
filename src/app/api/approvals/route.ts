import { api } from "@/server/http";
import { can } from "@/server/auth/actor";
import { listPendingApprovals } from "@/server/services/sales";
import { listPendingPriceChanges } from "@/server/services/pricing";

export const GET = api({ permission: ["discounts.approve", "prices.approve"] }, async ({ actor }) => ({
  discounts: can(actor, "discounts.approve") ? await listPendingApprovals(actor) : [],
  prices: can(actor, "prices.approve") ? await listPendingPriceChanges() : [],
}));
