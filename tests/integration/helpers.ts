import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { roles, users } from "@/server/db/schema";
import { hashPassword } from "@/server/auth/password";
import { loadActor, type Actor } from "@/server/auth/actor";

export const TEST_PASSWORD = "Test-Passw0rd!";
let cachedHash: string | null = null;

export function uid(prefix = "t") {
  return `${prefix}${randomBytes(4).toString("hex")}`;
}

/** Create a staff user directly (bypassing escalation checks) and return the loaded Actor. */
export async function makeUser(
  roleKey: "super_admin" | "admin" | "sales" | "accountant",
  over: Partial<typeof users.$inferInsert> = {},
): Promise<Actor> {
  const db = getDb();
  cachedHash ??= await hashPassword(TEST_PASSWORD);
  const [role] = await db.select().from(roles).where(eq(roles.key, roleKey));
  const [u] = await db
    .insert(users)
    .values({
      username: uid(roleKey.slice(0, 3)),
      displayName: `Test ${roleKey}`,
      passwordHash: cachedHash,
      roleId: role.id,
      mustChangePassword: false,
      ...over,
    })
    .returning();
  const actor = await loadActor(u.id);
  if (!actor) throw new Error("failed to load actor");
  return actor;
}

export async function reload(actor: Actor): Promise<Actor> {
  const a = await loadActor(actor.id);
  if (!a) throw new Error("actor gone");
  return a;
}

export const client = { ip: "127.0.0.1", userAgent: "vitest" };

/** Await a promise expected to reject; return the error. */
export async function rejects(p: Promise<unknown>): Promise<Error & { code?: string; message: string }> {
  try {
    await p;
  } catch (e) {
    return e as Error & { code?: string };
  }
  throw new Error("Expected promise to reject");
}
