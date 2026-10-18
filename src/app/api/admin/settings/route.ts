import { api } from "@/server/http";
import { getAllSettings } from "@/server/settings";

export const GET = api(
  { permission: ["settings.business", "settings.tax", "settings.payment", "settings.documents", "discounts.configure"] },
  async () => getAllSettings(),
);
