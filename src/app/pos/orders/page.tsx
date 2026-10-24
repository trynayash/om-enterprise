import { Suspense } from "react";
import Link from "next/link";
import { MessageCircle, Phone } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { getWebsiteOrder, listWebsiteOrders } from "@/server/services/website-orders";
import { OrderActions } from "@/components/pos/order-actions";
import { str, type SP } from "@/components/pos/list-utils";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { DateTime, Money, Qty } from "@/components/ui/money";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui/page";
import { cn } from "@/components/ui/cn";
import { buttonClass } from "@/components/ui/button";
import { whatsappLink } from "@/lib/india";
import { optionLabel } from "@/lib/line-description";
import { preferredContactLabel } from "@/components/staff/labels";

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
      <nav className="flex gap-1 overflow-x-auto max-sm:scroll-fade-x shadow-[inset_0_-1px_0_var(--color-navy-200)]" aria-label="Order status">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "active" ? "/pos/orders" : `/pos/orders?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors",
              tab === t.key ? "border-gold-500 text-navy-950" : "border-transparent text-navy-500 hover:text-navy-950",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {orders.length === 0 ? (
        <EmptyState title="Nothing here" description={tab === "active" ? "New website enquiries and order requests will appear here." : undefined} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {details.map(({ order: o, lines }) => (
            <article key={o.id} className="flex flex-col overflow-hidden rounded-xl border border-navy-200 bg-white shadow-card">
              <header className="flex flex-wrap items-center gap-2 border-b border-navy-200 bg-paper/60 px-5 py-2.5">
                <span className="font-mono text-sm font-semibold text-navy-950">{o.orderNumber}</span>
                <Badge tone={o.kind === "order_request" ? "gold" : "blue"}>{o.kind === "order_request" ? "Order request" : "Enquiry"}</Badge>
                <StatusBadge status={o.status} />
                <span className="ml-auto text-xs text-navy-500">
                  <DateTime value={o.createdAt} />
                </span>
              </header>
              <div className="flex-1 space-y-3.5 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-navy-950">{o.customerName}</div>
                    <div className="text-sm text-navy-600">{[o.city, o.address].filter(Boolean).join(" · ") || "No address given"}</div>
                    {o.preferredContact && <div className="mt-0.5 text-xs text-navy-500">{preferredContactLabel(o.preferredContact)}</div>}
                  </div>
                  <div className="flex gap-2">
                    <a href={`tel:+91${o.mobile}`} className={buttonClass("outline", "md", "font-mono font-medium")}>
                      <Phone className="h-4 w-4" /> {o.mobile}
                    </a>
                    <a
                      href={whatsappLink(o.mobile, `Hello ${o.customerName}, this is OM ENTERPRISE about your ${o.kind === "order_request" ? "order request" : "enquiry"} ${o.orderNumber}.`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonClass("success", "md", "px-3")}
                      aria-label="WhatsApp customer"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </a>
                  </div>
                </div>
                {o.message && <p className="border-l-[3px] border-navy-200 py-0.5 pl-3 text-sm leading-relaxed text-navy-800">&ldquo;{o.message}&rdquo;</p>}
                {lines.length > 0 && (
                  <ul className="divide-y divide-navy-100 rounded-lg border border-navy-200 text-sm">
                    {lines.map((l) => (
                      <li key={l.id} className="flex justify-between gap-3 px-3 py-2.5">
                        <span className="min-w-0">
                          <span className="font-medium text-navy-950">{l.productName}</span>
                          {optionLabel(l.variantName) && <span className="text-navy-500"> · {l.variantName}</span>}
                          <span className="mt-0.5 block font-mono text-xs text-navy-500">{l.sku}</span>
                        </span>
                        <span className="shrink-0 text-right font-mono">
                          <Qty value={l.quantity} />
                          {l.indicativeUnitPrice && (
                            <span className="mt-0.5 block text-xs text-navy-500">
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
                    Indicative total at submission: <Money value={o.indicativeTotal} className="font-mono font-semibold text-navy-950" />
                  </div>
                )}
                {o.convertedSaleId && (
                  <Link href={`/pos/sale/${o.convertedSaleId}`} className="link-draw inline-block text-sm font-semibold text-navy-900">
                    Open the sale →
                  </Link>
                )}
              </div>
              {canManage && (
                <footer className="border-t border-navy-200 px-5 py-3">
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
