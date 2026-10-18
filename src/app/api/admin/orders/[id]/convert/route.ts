import { api } from "@/server/http";
import { convertWebsiteOrder } from "@/server/services/website-orders";

export const POST = api({ permission: ["orders.manage"] }, async ({ actor, params }) => convertWebsiteOrder(actor, params.id));
