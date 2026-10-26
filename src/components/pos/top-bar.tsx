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
    <header className="no-print sticky top-0 z-30 bg-navy-950 text-white">
      <div className="mx-auto flex h-14 max-w-[1500px] items-stretch gap-3 px-3 sm:px-5">
        <Link href="/pos" className="flex shrink-0 items-center gap-2.5 pr-1">
          <LogoMark className="h-8 w-8" />
          <span className="hidden text-[13px] font-bold sm:inline">OM ENTERPRISE</span>
          <span aria-hidden className="hidden h-4 w-px bg-white/20 sm:block" />
          <span className="label-sm text-gold-400">POS</span>
        </Link>
        <PosNavLinks items={items} variant="desktop" />
        <div className="ml-auto flex items-center">
          <PosUserMenu name={actor.displayName} role={actor.roleName} canDashboard={can(actor, "dashboard.view")} />
        </div>
      </div>
      <PosNavLinks items={items} variant="mobile" />
    </header>
  );
}

export function PosTopBarSkeleton() {
  return <header className="h-14 bg-navy-950" aria-hidden />;
}
