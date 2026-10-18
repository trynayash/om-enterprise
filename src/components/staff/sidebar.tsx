import { requirePageActor } from "@/server/auth/session";
import { visibleNav } from "@/lib/nav";
import { can } from "@/server/auth/actor";
import { newOrderCount } from "@/server/services/website-orders";
import { SidebarNav } from "./sidebar-nav";
import { getDb } from "@/server/db/client";
import { approvalRequests, variantPrices } from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";

export async function Sidebar() {
  const actor = await requirePageActor();
  const groups = visibleNav(actor.permissions, actor.isSuperAdmin);
  const badges: Record<string, number> = {};
  if (can(actor, "orders.view")) badges["/dashboard/orders"] = await newOrderCount();
  const db = getDb();
  let approvals = 0;
  if (can(actor, "discounts.approve")) {
    approvals += (await db.select({ c: sql<number>`count(*)::int` }).from(approvalRequests).where(eq(approvalRequests.status, "pending")))[0].c;
  }
  if (can(actor, "prices.approve")) {
    approvals += (await db.select({ c: sql<number>`count(*)::int` }).from(variantPrices).where(eq(variantPrices.status, "pending")))[0].c;
  }
  badges["/dashboard/approvals"] = approvals;
  return <SidebarNav groups={groups} user={{ name: actor.displayName, role: actor.roleName }} badges={badges} />;
}

export function SidebarSkeleton() {
  return <aside className="hidden h-screen w-64 shrink-0 bg-navy-900 lg:block" aria-hidden />;
}
