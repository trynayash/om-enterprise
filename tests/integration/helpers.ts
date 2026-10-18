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

/** Sign in an account without a secret key; fails if a second step is required. */
export async function sessionLogin(username: string, password: string, c = client) {
  const { login } = await import("@/server/services/auth");
  const r = await login(username, password, c);
  if (r.kind !== "session") throw new Error("expected a session, got a secret-key challenge");
  return r;
}

/** Message of a DB error raised by a trigger (drizzle wraps the driver error in `cause`). */
export async function dbErrorMessage(p: Promise<unknown>): Promise<string> {
  const e = (await rejects(p)) as Error & { cause?: Error };
  return `${e.message} ${e.cause?.message ?? ""}`;
}

/** Await a promise expected to reject; return the error. */
export async function rejects(p: Promise<unknown>): Promise<Error & { code?: string; message: string }> {
  try {
    await p;
  } catch (e) {
    return e as Error & { code?: string };
  }
  throw new Error("Expected promise to reject");
}

/* ---------------- Catalogue fixtures ---------------- */
import { categories as categoriesT, taxClasses as taxClassesT } from "@/server/db/schema";
import { createProduct, createVariant } from "@/server/services/catalog";
import { proposePrice, recordCost } from "@/server/services/pricing";
import { saveSettings, getSettings } from "@/server/settings";

export async function firstCategoryId() {
  const [c] = await getDb().select().from(categoriesT).limit(1);
  return c.id;
}

export async function taxClassId(rate: string) {
  const rows = await getDb().select().from(taxClassesT);
  const t = rows.find((r) => Number(r.gstRate) === Number(rate));
  if (!t) throw new Error(`no tax class ${rate}`);
  return t.id;
}

/** Create product + variant with a retail price (and optional cost). Returns ids. */
export async function makeItem(
  admin: Actor,
  opts: { price: string; includesTax?: boolean; gst?: string; cost?: string | null; unit?: string; isSample?: boolean; name?: string } ,
) {
  const product = await createProduct(admin, {
    name: opts.name ?? `Item ${uid()}`,
    categoryId: await firstCategoryId(),
    unitCode: opts.unit ?? "pcs",
    taxClassId: await taxClassId(opts.gst ?? "18"),
    hsnCode: "3917",
    isSample: opts.isSample ?? false,
  });
  const variant = await createVariant(admin, product.id, { sku: uid("SKU-").toUpperCase(), name: "Std", unitCode: opts.unit ?? "pcs" });
  await proposePrice(admin, { variantId: variant.id, price: opts.price, priceIncludesTax: opts.includesTax ?? true, reason: "test price" });
  if (opts.cost) {
    await recordCost(admin, { variantId: variant.id, purchaseCost: opts.cost, purchaseTaxRate: "18", freight: "0", handling: "0", otherCosts: "0", reason: "test cost" });
  }
  return { productId: product.id, variantId: variant.id, sku: variant.sku };
}

export async function setRegistration(type: "regular" | "composition" | "unregistered" | null) {
  const tax = await getSettings("tax");
  const db = getDb();
  await db.transaction((tx) => saveSettings(tx, { userId: null, label: "test" }, "tax", { ...tax, registrationType: type }));
}
