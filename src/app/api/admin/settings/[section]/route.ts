import { z } from "zod";
import { api } from "@/server/http";
import { getDb } from "@/server/db/client";
import { auditActorOf, requirePermission, requireSuperAdmin } from "@/server/auth/actor";
import { notFound } from "@/server/errors";
import { saveSettings } from "@/server/settings";
import { SETTINGS_EDIT_PERMISSION, SETTINGS_SCHEMAS, type SettingsSection } from "@/lib/settings-schema";
import type { Permission } from "@/lib/permissions";

export const PUT = api({}, async (ctx) => {
  const section = ctx.params.section as SettingsSection;
  if (!(section in SETTINGS_SCHEMAS)) throw notFound("Settings section");
  const needed = SETTINGS_EDIT_PERMISSION[section];
  if (needed === "super_admin" || section === "tax") requireSuperAdmin(ctx.actor);
  else requirePermission(ctx.actor, needed as Permission);
  const value = await ctx.body(z.record(z.string(), z.unknown()));
  return getDb().transaction((tx) => saveSettings(tx, auditActorOf(ctx.actor), section, value));
});
