import { Suspense } from "react";
import Link from "next/link";
import { Globe, MessageCircle, Phone } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { getWebsiteOrder, listWebsiteOrders } from "@/server/services/website-orders";
import { OrderActions } from "@/components/pos/order-actions";
import { str, type SP } from "@/components/pos/list-utils";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { DateTime, Money, Qty } from "@/components/ui/money";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui/page";
import { cn } from "@/components/ui/cn";
import { whatsappLink } from "@/lib/india";

export const metadata = { title: "Customer orders" };

const TABS = [
  { key: "active", label: "Open" },
  { key: "converted", label: "Converted" },
  { key: "closed", label: "Closed" },
  { key: "spam", label: "Spam" },
];

export default function OrdersPage({ searchParams }: PageProps<"/pos/orders">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}

async function Orders({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const actor = await requirePageActor("orders.view");
  const tab = TABS.some((t) => t.key === str(sp, "tab")) ? str(sp, "tab") : "active";
  const all = await listWebsiteOrders(actor, tab === "active" ? undefined : tab);
  const orders = (tab === "active" ? all.filter((o) => ["new", "contacted", "quoted"].includes(o.status)) : all).slice(0, 40);
  const details = [];
  for (const o of orders) details.push(await getWebsiteOrder(actor, o.id));
  const canConvert = can(actor, "orders.manage") && can(actor, "sales.create");
  const canManage = can(actor, "orders.manage");

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Point of sale"
        title="Customer orders"
        description="Enquiries and order requests from the website. Website prices are indicative — starting a sale applies today's prices."
      />
      <nav className="flex flex-wrap gap-2" aria-label="Order status">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "active" ? "/pos/orders" : `/pos/orders?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn("rounded-full px-4 py-2 text-sm font-bold", tab === t.key ? "bg-navy-900 text-white" : "bg-white text-navy-700 ring-1 ring-navy-100 hover:bg-navy-50")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {orders.length === 0 ? (
        <EmptyState icon={<Globe className="h-10 w-10" />} title="Nothing here" description={tab === "active" ? "New website enquiries and order requests will appear here." : undefined} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {details.map(({ order: o, lines }) => (
            <article key={o.id} className="flex flex-col rounded-2xl border border-navy-100 bg-white shadow-card">
              <header className="flex flex-wrap items-center gap-2 border-b border-navy-100 px-5 py-3">
                <span className="font-mono font-bold text-navy-900">{o.orderNumber}</span>
                <Badge tone={o.kind === "order_request" ? "gold" : "blue"}>{o.kind === "order_request" ? "Order request" : "Enquiry"}</Badge>
                <StatusBadge status={o.status} />
                <span className="ml-auto text-xs text-navy-500">
                  <DateTime value={o.createdAt} />
                </span>
              </header>
              <div className="flex-1 space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-bold text-navy-900">{o.customerName}</div>
                    <div className="text-sm text-navy-600">{[o.city, o.address].filter(Boolean).join(" · ") || "No address given"}</div>
                    {o.preferredContact && <div className="text-xs text-navy-500">Prefers: {o.preferredContact}</div>}
                  </div>
                  <div className="flex gap-2">
                    <a href={`tel:+91${o.mobile}`} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-navy-200 px-3 text-sm font-semibold text-navy-800 hover:bg-navy-50">
                      <Phone className="h-4 w-4" /> {o.mobile}
                    </a>
                    <a
                      href={whatsappLink(o.mobile, `Hello ${o.customerName}, this is OM ENTERPRISE about your ${o.kind === "order_request" ? "order request" : "enquiry"} ${o.orderNumber}.`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800"
                      aria-label="WhatsApp customer"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </a>
                  </div>
                </div>
                {o.message && <p className="rounded-xl bg-navy-50 px-3 py-2 text-sm text-navy-800">&ldquo;{o.message}&rdquo;</p>}
                {lines.length > 0 && (
                  <ul className="divide-y divide-navy-50 rounded-xl border border-navy-100 text-sm">
                    {lines.map((l) => (
                      <li key={l.id} className="flex justify-between gap-3 px-3 py-2">
                        <span className="min-w-0">
                          <span className="font-medium">{l.productName}</span>
                          {l.variantName && <span className="text-navy-500"> · {l.variantName}</span>}
                          <span className="block text-xs text-navy-400">{l.sku}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <Qty value={l.quantity} />
                          {l.indicativeUnitPrice && (
                            <span className="block text-xs text-navy-500">
                              @ <Money value={l.indicativeUnitPrice} />
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {o.indicativeTotal && (
                  <div className="text-sm text-navy-600">
                    Indicative total at submission: <Money value={o.indicativeTotal} className="font-bold text-navy-900" />
                  </div>
                )}
                {o.convertedSaleId && (
                  <Link href={`/pos/sale/${o.convertedSaleId}`} className="inline-block text-sm font-semibold text-navy-700 underline-offset-2 hover:underline">
                    Open the sale →
                  </Link>
                )}
              </div>
              {canManage && (
                <footer className="border-t border-navy-100 px-5 py-3">
                  <OrderActions id={o.id} status={o.status} canConvert={canConvert && lines.length > 0} />
                </footer>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
