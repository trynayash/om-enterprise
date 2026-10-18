import Link from "next/link";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { LogoMark } from "@/components/ui/logo";
import { PosUserMenu } from "./user-menu";
import { PosNavLinks, type PosNavItem } from "./nav-links";

export async function PosTopBar() {
  const actor = await requirePageActor("sales.create");
  const items: PosNavItem[] = [
    { href: "/pos", label: "Sale" },
    { href: "/pos/products", label: "Prices" },
    { href: "/pos/bills", label: "Bills" },
    ...(can(actor, "payments.view") ? [{ href: "/pos/payments", label: "Payments" }] : []),
    ...(can(actor, "orders.view") ? [{ href: "/pos/orders", label: "Customer orders" }] : []),
    ...(can(actor, "dashboard.view") ? [{ href: "/dashboard", label: "Dashboard" }] : []),
  ];
  return (
    <header className="no-print sticky top-0 z-30 border-b border-navy-800 bg-navy-900 text-white">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-3 px-3 sm:px-5">
        <Link href="/pos" className="flex items-center gap-2.5">
          <LogoMark className="h-8 w-8" />
          <span className="hidden text-sm font-extrabold tracking-[0.12em] sm:inline">OM ENTERPRISE</span>
          <span className="rounded-md bg-gold-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-navy-950">POS</span>
        </Link>
        <PosNavLinks items={items} variant="desktop" />
        <div className="ml-auto">
          <PosUserMenu name={actor.displayName} role={actor.roleName} canDashboard={can(actor, "dashboard.view")} />
        </div>
      </div>
      <PosNavLinks items={items} variant="mobile" />
    </header>
  );
}

export function PosTopBarSkeleton() {
  return <header className="h-14 border-b border-navy-800 bg-navy-900" aria-hidden />;
}
