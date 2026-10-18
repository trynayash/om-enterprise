import { Suspense } from "react";
import Link from "next/link";
import { MessageCircle, Phone } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { listWebsiteOrders } from "@/server/services/website-orders";
import { EmptyState, PageHeader, PageSkeleton, TableWrap, td, th } from "@/components/ui/page";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { DateTime, Money } from "@/components/ui/money";
import { FilterBar } from "@/components/dashboard/ops/filter-bar";
import { str, type SearchParams } from "@/components/dashboard/ops/params";
import { whatsappLink } from "@/lib/india";

export const metadata = { title: "Website orders" };

export default function OrdersPage({ searchParams }: PageProps<"/dashboard/orders">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}

async function Orders({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePageActor("orders.view");
  const sp = await searchParams;
  const status = str(sp, "status");
  const rows = await listWebsiteOrders(actor, status);
  const newCount = rows.filter((r) => r.status === "new").length;

  return (
    <div>
      <PageHeader
        title="Website orders"
        description="Enquiries and order requests from the public website. Prices customers saw were indicative — confirm the final amount at billing."
      />
      <FilterBar
        fields={[
          {
            kind: "select",
            name: "status",
            label: "Status",
            options: [
              { value: "", label: "All" },
              { value: "new", label: "New" },
              { value: "contacted", label: "Contacted" },
              { value: "quoted", label: "Quoted" },
              { value: "converted", label: "Converted" },
              { value: "closed", label: "Closed" },
              { value: "spam", label: "Spam" },
            ],
          },
        ]}
        values={{ status }}
      />
      {!status && newCount > 0 && <p className="mb-3 text-sm font-semibold text-gold-700">{newCount} new request{newCount === 1 ? "" : "s"} waiting for a reply.</p>}
      {rows.length === 0 ? (
        <EmptyState title="No website orders" description="Enquiries submitted on the website will appear here." />
      ) : (
        <TableWrap>
          <table className="w-full min-w-[820px]">
            <thead>
              <tr>
                <th className={th}>Request</th>
                <th className={th}>Received</th>
                <th className={th}>Customer</th>
                <th className={th}>Contact</th>
                <th className={`${th} text-right`}>Items</th>
                <th className={`${th} text-right`}>Indicative total</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className={o.status === "new" ? "bg-gold-50/60 hover:bg-gold-50" : "hover:bg-navy-50/50"}>
                  <td className={td}>
                    <Link href={`/dashboard/orders/${o.id}`} className="font-semibold hover:underline">
                      {o.orderNumber}
                    </Link>
                    <div className="mt-0.5">
                      <Badge tone={o.kind === "order_request" ? "navy" : "blue"}>{o.kind === "order_request" ? "Order request" : "Enquiry"}</Badge>
                    </div>
                  </td>
                  <td className={`${td} text-navy-600`}>
                    <DateTime value={o.createdAt} />
                  </td>
                  <td className={td}>
                    <div className="font-medium">{o.customerName}</div>
                    {o.city && <div className="text-xs text-navy-500">{o.city}</div>}
                  </td>
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <a href={`tel:+91${o.mobile}`} className="inline-flex items-center gap-1 tabular hover:underline" aria-label={`Call ${o.customerName}`}>
                        <Phone className="h-3.5 w-3.5 text-navy-400" />
                        {o.mobile}
                      </a>
                      <a href={whatsappLink(o.mobile)} target="_blank" rel="noopener noreferrer" className="rounded-md p-1 text-emerald-700 hover:bg-emerald-50" aria-label={`WhatsApp ${o.customerName}`}>
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    </div>
                    {o.preferredContact && <div className="text-xs text-navy-500">Prefers {o.preferredContact}</div>}
                  </td>
                  <td className={`${td} text-right tabular`}>{o.itemCount}</td>
                  <td className={`${td} text-right`}>{o.indicativeTotal ? <Money value={o.indicativeTotal} /> : <span className="text-navy-300">—</span>}</td>
                  <td className={td}>
                    <StatusBadge status={o.status} />
                    {o.handledByName && <div className="mt-0.5 text-xs text-navy-500">{o.handledByName}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}
