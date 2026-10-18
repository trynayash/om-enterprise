import { api } from "@/server/http";
import { getAllSettings } from "@/server/settings";

export const GET = api({}, async () => getAllSettings());
