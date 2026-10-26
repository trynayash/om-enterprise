import { requirePageActor } from "@/server/auth/session";
import { visibleNav } from "@/lib/nav";
import { can } from "@/server/auth/actor";
import { newOrderCount } from "@/server/services/website-orders";
import { countPendingPriceChanges } from "@/server/services/pricing";
import { SidebarNav, type NavBadge } from "./sidebar-nav";
import { getDb } from "@/server/db/client";
import { approvalRequests } from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";

export async function Sidebar() {
  const actor = await requirePageActor();
  const groups = visibleNav(actor.permissions, actor.isSuperAdmin);
  const badges: Record<string, NavBadge> = {};
  if (can(actor, "orders.view")) badges["/dashboard/orders"] = { count: await newOrderCount() };
  const db = getDb();
  // A discount waiting for approval has a customer waiting at the counter: that count is the loud one.
  // Prices waiting (a price list can bring a thousand) are counted quietly on Price review.
  if (can(actor, "discounts.approve")) {
    badges["/dashboard/approvals"] = { count: (await db.select({ c: sql<number>`count(*)::int` }).from(approvalRequests).where(eq(approvalRequests.status, "pending")))[0].c };
  }
  if (can(actor, "prices.approve")) {
    badges["/dashboard/pricing"] = { count: await countPendingPriceChanges(), quiet: true };
  }
  return <SidebarNav groups={groups} user={{ name: actor.displayName, role: actor.roleName }} badges={badges} />;
}

/** Same footprint as the real sidebar so the page doesn't shift when it streams in. */
export function SidebarSkeleton() {
  return (
    <>
      <div className="h-14 shrink-0 border-b border-navy-950 bg-navy-900 lg:hidden" aria-hidden />
      <aside className="hidden w-60 shrink-0 border-r border-navy-950 bg-navy-900 lg:block" aria-hidden />
    </>
  );
}
