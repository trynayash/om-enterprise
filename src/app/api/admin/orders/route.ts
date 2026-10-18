import { api } from "@/server/http";
import { listWebsiteOrders } from "@/server/services/website-orders";

export const GET = api({ permission: "orders.view" }, async ({ actor, query }) => listWebsiteOrders(actor, query.get("status") ?? undefined));
