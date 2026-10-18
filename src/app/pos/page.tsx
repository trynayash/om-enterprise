import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardList, Globe, Receipt, Search, Wallet } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { listSales } from "@/server/services/sales";
import { newOrderCount } from "@/server/services/website-orders";
import { loadPosConfig } from "@/components/pos/config";
import { NewSaleButton } from "@/components/pos/new-sale-button";
import { TaxBanner } from "@/components/pos/tax-banner";
import { PageSkeleton } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
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

function greeting() {
  const h = new Date(Date.now() + 5.5 * 3600_000).getUTCHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

async function PosHome() {
  const actor = await requirePageActor("sales.create");
  const cfg = await loadPosConfig();
  const [drafts, awaiting] = [
    await listSales(actor, { status: "draft", staffId: actor.id, includeTraining: true, pageSize: 8 }),
    await listSales(actor, { status: "finalized", staffId: actor.id, includeTraining: true, pageSize: 8 }),
  ];
  const ordersCount = can(actor, "orders.view") ? await newOrderCount() : 0;
  const today = istParts(new Date());
  const open = [...awaiting.items, ...drafts.items];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-gold-600">
            {new Date(Date.UTC(today.year, today.month - 1, today.day)).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">
            {greeting()}, {actor.displayName.split(" ")[0]}
          </h1>
        </div>
      </div>

      <TaxBanner registrationType={cfg.registrationType} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NewSaleButton className="sm:col-span-2 lg:row-span-2 lg:min-h-full" />
        <Tile href="/pos/products" icon={<Search className="h-6 w-6" />} title="Search products" text="Look up any item, variant and price" />
        <Tile href="/pos/bills" icon={<Receipt className="h-6 w-6" />} title="Recent bills" text="Find, reprint and share bills" />
        <Tile href="/pos/payments" icon={<Wallet className="h-6 w-6" />} title="Payment history" text="Verified, pending and refunded payments" />
        {can(actor, "orders.view") && (
          <Tile
            href="/pos/orders"
            icon={<Globe className="h-6 w-6" />}
            title="Customer orders"
            text="Enquiries & order requests from the website"
            badge={ordersCount ? `${ordersCount} new` : undefined}
          />
        )}
      </div>

      <section aria-labelledby="open-sales" className="rounded-2xl border border-navy-100 bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-navy-100 px-5 py-4">
          <h2 id="open-sales" className="flex items-center gap-2 text-base font-bold text-navy-900">
            <ClipboardList className="h-5 w-5 text-gold-600" /> Your open sales
          </h2>
          <span className="hidden text-xs text-navy-500 sm:inline">Drafts and sales awaiting payment</span>
        </div>
        {open.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-navy-500">No open sales. Tap NEW SALE to start one.</p>
        ) : (
          <ul className="divide-y divide-navy-50">
            {open.map((s) => (
              <li key={s.id}>
                <Link href={`/pos/sale/${s.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-navy-50/60">
                  <span className="font-mono text-sm font-bold text-navy-900">{s.saleNumber}</span>
                  <SaleStatusBadge status={s.status} paymentStatus={s.paymentStatus} />
                  {s.isTraining && <Badge tone="red">Training</Badge>}
                  {s.approvalStatus === "pending" && <Badge tone="amber">Approval pending</Badge>}
                  <span className="text-sm text-navy-500">
                    {s.itemCount} item{s.itemCount === 1 ? "" : "s"}
                    {s.customerName ? ` · ${s.customerName}` : ""}
                  </span>
                  <span className="ml-auto flex items-center gap-4">
                    <span className="text-xs text-navy-400">
                      <DateTime value={s.createdAt} />
                    </span>
                    <Money value={s.grandTotal} className="text-base font-bold" />
                    <ArrowRight className="h-4 w-4 text-navy-300" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Tile({ href, icon, title, text, badge }: { href: string; icon: React.ReactNode; title: string; text: string; badge?: string }) {
  return (
    <Link
      href={href}
      className="group relative flex min-h-32 flex-col justify-between rounded-3xl border border-navy-100 bg-white p-5 shadow-card sm:min-h-36 transition-all hover:-translate-y-0.5 hover:border-gold-300 hover:shadow-lift"
    >
      <span className="flex items-center justify-between">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-900 text-gold-400">{icon}</span>
        {badge && <span className="rounded-full bg-gold-500 px-2.5 py-1 text-xs font-extrabold text-navy-950">{badge}</span>}
      </span>
      <span className="mt-4 pr-7">
        <span className="block text-lg font-extrabold uppercase tracking-wide text-navy-900">{title}</span>
        <span className="mt-0.5 block text-sm text-navy-500">{text}</span>
      </span>
      <ArrowRight className="absolute bottom-5 right-5 h-5 w-5 text-navy-200 transition-colors group-hover:text-gold-500" />
    </Link>
  );
}
