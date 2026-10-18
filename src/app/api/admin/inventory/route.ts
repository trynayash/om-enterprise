import { api } from "@/server/http";
import { recentMovements, stockLevels } from "@/server/services/inventory";

export const GET = api({ permission: ["inventory.view", "inventory.manage"] }, async ({ actor }) => ({ levels: await stockLevels(actor), recent: await recentMovements(actor) }));
