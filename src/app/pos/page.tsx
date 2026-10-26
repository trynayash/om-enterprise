import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Globe, Receipt, Search, Wallet } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { listSales } from "@/server/services/sales";
import { newOrderCount } from "@/server/services/website-orders";
import { loadPosConfig } from "@/components/pos/config";
import { NewSaleButton } from "@/components/pos/new-sale-button";
import { TaxBanner } from "@/components/pos/tax-banner";
import { PageSkeleton } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { TrainingBadge } from "@/components/staff/labels";
import { SaleStatusBadge } from "@/components/pos/sale-status";
import { DateTime, Money } from "@/components/ui/money";
import { istParts } from "@/lib/india";

export default function PosHomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PosHome />
    </Suspense>
  );
}

async function PosHome() {
  const actor = await requirePageActor("sales.create");
  const cfg = await loadPosConfig();
  const [drafts, awaiting] = [
    // A draft with nothing in it is an abandoned "New sale" tap, not open work: leave it out.
    await listSales(actor, { status: "draft", staffId: actor.id, includeTraining: true, hasItems: true, pageSize: 8 }),
    await listSales(actor, { status: "finalized", staffId: actor.id, includeTraining: true, pageSize: 8 }),
  ];
  const ordersCount = can(actor, "orders.view") ? await newOrderCount() : 0;
  const today = istParts(new Date());
  const open = [...awaiting.items, ...drafts.items];

  return (
    <div className="space-y-6">
      <div>
        <div className="label-caps mb-1.5 text-gold-700">
          {new Date(Date.UTC(today.year, today.month - 1, today.day)).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
        </div>
        <h1 className="headline text-[2.25rem] font-bold text-navy-950 sm:text-[2.75rem]">Point of sale</h1>
      </div>

      <TaxBanner registrationType={cfg.registrationType} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <NewSaleButton className="lg:min-h-full" />
        <ul className="divide-y divide-navy-100 overflow-hidden rounded-xl border border-navy-200 bg-white shadow-card">
          <Shortcut href="/pos/products" icon={<Search />} title="Price list" text="Look up any item, variant and price" />
          <Shortcut href="/pos/bills" icon={<Receipt />} title="Recent bills" text="Find, reprint and share bills" />
          <Shortcut href="/pos/payments" icon={<Wallet />} title="Payment history" text="Verified, pending and refunded payments" />
          {can(actor, "orders.view") && (
            <Shortcut
              href="/pos/orders"
              icon={<Globe />}
              title="Customer orders"
              text="Enquiries & order requests from the website"
              badge={ordersCount ? `${ordersCount} new` : undefined}
            />
          )}
        </ul>
      </div>

      <section aria-labelledby="open-sales" className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-navy-200 bg-paper/60 px-5 py-3">
          <h2 id="open-sales" className="text-[15px] font-semibold text-navy-950">
            Your open sales
            {open.length > 0 && <span className="ml-2 font-mono text-xs font-medium text-navy-500 tabular">{open.length}</span>}
          </h2>
          <span className="text-xs text-navy-500">Drafts and sales awaiting payment</span>
        </div>
        {open.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-navy-500">No open sales. Tap NEW SALE to start one.</p>
        ) : (
          <ul className="stagger divide-y divide-navy-100">
            {open.map((s, i) => (
              <li key={s.id} style={{ "--i": i } as React.CSSProperties}>
                <Link
                  href={`/pos/sale/${s.id}`}
                  className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-5 py-3.5 transition-colors hover:bg-paper/60 sm:flex"
                >
                  <span className="font-mono text-sm font-semibold text-navy-950 sm:order-1 sm:w-[5.5rem]">{s.saleNumber}</span>
                  <Money value={s.grandTotal} className="text-right font-mono text-[15px] font-semibold text-navy-950 sm:order-4" />
                  <span className="col-span-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 sm:order-2">
                    <SaleStatusBadge status={s.status} paymentStatus={s.paymentStatus} />
                    {s.isTraining && <TrainingBadge />}
                    {s.approvalStatus === "pending" && <Badge tone="amber">Approval pending</Badge>}
                    <span className="ml-1.5 text-sm text-navy-500">
                      {s.itemCount} item{s.itemCount === 1 ? "" : "s"}
                      {s.customerName ? ` · ${s.customerName}` : ""}
                    </span>
                  </span>
                  <span className="hidden text-xs text-navy-400 sm:order-3 sm:ml-auto sm:inline">
                    <DateTime value={s.createdAt} />
                  </span>
                  <ArrowRight className="hidden h-4 w-4 text-navy-300 transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-navy-900 sm:order-5 sm:block" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Shortcut({ href, icon, title, text, badge }: { href: string; icon: React.ReactElement; title: string; text: string; badge?: string }) {
  return (
    <li>
      <Link href={href} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-paper/60 sm:py-[1.15rem]">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-navy-200 text-navy-600 transition-colors group-hover:border-navy-900 group-hover:text-navy-900 [&>svg]:h-[18px] [&>svg]:w-[18px]">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-navy-950">{title}</span>
            {badge && <Badge tone="gold">{badge}</Badge>}
          </span>
          <span className="mt-0.5 block text-[13px] text-navy-500">{text}</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-navy-300 transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-navy-900" />
      </Link>
    </li>
  );
}
