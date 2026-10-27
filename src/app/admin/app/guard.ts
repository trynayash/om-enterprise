import "server-only";
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/server/auth/session";
import { can, type Actor } from "@/server/auth/actor";
import { landingPath } from "@/lib/nav";

/** The owner app is for people who see the overview (the owner and administrators); others go to their usual page. */
export async function requireOwner(): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/admin?next=/admin/app");
  if (actor.mustChangePassword) redirect("/account/password?required=1");
  if (!can(actor, "dashboard.view")) redirect(landingPath(actor.permissions, actor.isSuperAdmin));
  return actor;
}
