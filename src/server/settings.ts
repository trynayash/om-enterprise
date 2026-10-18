import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, type Tx } from "@/server/db/client";
import { settings } from "@/server/db/schema";
import {
  parseSection,
  SETTINGS_DEFAULTS,
  SETTINGS_SCHEMAS,
  type Settings,
  type SettingsSection,
} from "@/lib/settings-schema";
import { audit, diff, type AuditActor } from "@/server/audit";
import { invalid } from "@/server/errors";

export async function getSettings<K extends SettingsSection>(section: K, tx?: Tx): Promise<Settings[K]> {
  const db = tx ?? getDb();
  const rows = await db.select({ value: settings.value }).from(settings).where(eq(settings.section, section));
  return parseSection(section, rows[0]?.value);
}

export async function getAllSettings(tx?: Tx): Promise<Settings> {
  const db = tx ?? getDb();
  const rows = await db.select().from(settings);
  const map = new Map(rows.map((r) => [r.section, r.value]));
  const out = {} as Record<string, unknown>;
  for (const section of Object.keys(SETTINGS_DEFAULTS) as SettingsSection[]) {
    out[section] = parseSection(section, map.get(section));
  }
  return out as Settings;
}

/** Validate and save a settings section; records a before/after audit entry. Authorization is the caller's job. */
export async function saveSettings<K extends SettingsSection>(
  tx: Tx,
  actor: AuditActor,
  section: K,
  value: unknown,
): Promise<Settings[K]> {
  const parsed = SETTINGS_SCHEMAS[section].safeParse(value);
  if (!parsed.success) {
    throw invalid("Some settings are invalid", { issues: parsed.error.issues });
  }
  const before = await getSettings(section, tx);
  const next = parsed.data as Settings[K];
  await tx
    .insert(settings)
    .values({ section, value: next, version: 1, updatedBy: actor.userId })
    .onConflictDoUpdate({
      target: settings.section,
      set: { value: next, version: sql`${settings.version} + 1`, updatedAt: new Date(), updatedBy: actor.userId },
    });
  await audit(tx, actor, {
    action: "settings.update",
    entityType: "settings",
    entityId: section,
    summary: `Updated ${section} settings`,
    data: { changes: diff(before as Record<string, unknown>, next as Record<string, unknown>) },
  });
  return next;
}
