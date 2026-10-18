import Link from "next/link";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { LogoMark } from "@/components/ui/logo";
import { PosUserMenu } from "./user-menu";

export async function PosTopBar() {
  const actor = await requirePageActor("sales.create");
  return (
    <header className="no-print sticky top-0 z-30 border-b border-navy-800 bg-navy-900 text-white">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-3 px-3 sm:px-5">
        <Link href="/pos" className="flex items-center gap-2.5">
          <LogoMark className="h-8 w-8" />
          <span className="hidden text-sm font-extrabold tracking-[0.12em] sm:inline">OM ENTERPRISE</span>
          <span className="rounded-md bg-gold-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-navy-950">POS</span>
        </Link>
        <nav className="ml-2 hidden items-center gap-1 text-sm md:flex">
          <Link href="/pos" className="rounded-lg px-3 py-1.5 text-navy-200 hover:bg-white/10 hover:text-white">Home</Link>
          <Link href="/pos/bills" className="rounded-lg px-3 py-1.5 text-navy-200 hover:bg-white/10 hover:text-white">Bills</Link>
          <Link href="/pos/payments" className="rounded-lg px-3 py-1.5 text-navy-200 hover:bg-white/10 hover:text-white">Payments</Link>
          <Link href="/pos/orders" className="rounded-lg px-3 py-1.5 text-navy-200 hover:bg-white/10 hover:text-white">Customer orders</Link>
          {can(actor, "dashboard.view") && (
            <Link href="/dashboard" className="rounded-lg px-3 py-1.5 text-navy-200 hover:bg-white/10 hover:text-white">Dashboard</Link>
          )}
        </nav>
        <div className="ml-auto">
          <PosUserMenu name={actor.displayName} role={actor.roleName} canDashboard={can(actor, "dashboard.view")} />
        </div>
      </div>
    </header>
  );
}

export function PosTopBarSkeleton() {
  return <header className="h-14 border-b border-navy-800 bg-navy-900" aria-hidden />;
}
