import "server-only";
import { asc } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";

/** Staff names for list filters (id + display name only). Callers must already hold sales.view_all. */
export async function listStaffOptions() {
  const rows = await getDb().select({ id: users.id, name: users.displayName }).from(users).orderBy(asc(users.displayName));
  return rows;
}
