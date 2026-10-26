import { Suspense } from "react";
import Link from "next/link";
import { MessageCircle, Phone } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { listWebsiteOrders } from "@/server/services/website-orders";
import { EmptyState, PageHeader, PageSkeleton, TableWrap } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/badge";
import { DateTime, Money } from "@/components/ui/money";
import { FilterBar } from "@/components/dashboard/ops/filter-bar";
import { str, type SearchParams } from "@/components/dashboard/ops/params";
import { whatsappLink } from "@/lib/india";
import { codeLink, rowHover, tdMuted, tdNum, tdText, th, thNum } from "@/components/dashboard/table";
import { preferredContactLabel } from "@/components/staff/labels";

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
        eyebrow="Sales"
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
      {!status && newCount > 0 && (
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-gold-700">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold-500" />
          {newCount} new request{newCount === 1 ? "" : "s"} waiting for a reply.
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState title="No website orders" description="Enquiries submitted on the website will appear here." />
      ) : (
        <TableWrap>
          <table className="stack-sm w-full min-w-[820px]">
            <thead>
              <tr>
                <th className={th}>Request</th>
                <th className={th}>Received</th>
                <th className={th}>Customer</th>
                <th className={th}>Contact</th>
                <th className={thNum}>Items</th>
                <th className={thNum}>Indicative total</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className={o.status === "new" ? "bg-gold-50/50 transition-colors duration-150 hover:bg-gold-50" : rowHover}>
                  <td data-label="Request" className={tdText}>
                    <Link href={`/dashboard/orders/${o.id}`} className={codeLink}>
                      {o.orderNumber}
                    </Link>
                    <div className="mt-0.5 text-xs text-navy-500">{o.kind === "order_request" ? "Order request" : "Enquiry"}</div>
                  </td>
                  <td data-label="Received" className={`${tdMuted} whitespace-nowrap`}>
                    <DateTime value={o.createdAt} />
                  </td>
                  <td data-label="Customer" className={tdText}>
                    <div className="font-medium">{o.customerName}</div>
                    {o.city && <div className="text-xs text-navy-500">{o.city}</div>}
                  </td>
                  <td data-label="Contact" className={tdText}>
                    <div className="flex items-center gap-1.5">
                      <a href={`tel:+91${o.mobile}`} className="inline-flex items-center gap-1.5 tabular text-[13px] underline-offset-[3px] hover:underline" aria-label={`Call ${o.customerName}`}>
                        <Phone className="h-3.5 w-3.5 text-navy-400" aria-hidden />
                        {o.mobile}
                      </a>
                      <a href={whatsappLink(o.mobile)} target="_blank" rel="noopener noreferrer" className="rounded-md p-1 text-emerald-700 transition-colors hover:bg-emerald-50" aria-label={`WhatsApp ${o.customerName}`}>
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    </div>
                    {o.preferredContact && <div className="text-xs text-navy-500">{preferredContactLabel(o.preferredContact)}</div>}
                  </td>
                  <td data-label="Items" className={tdNum}>{o.itemCount}</td>
                  <td data-label="Indicative total" className={tdNum}>{o.indicativeTotal ? <Money value={o.indicativeTotal} /> : <span className="text-navy-300">—</span>}</td>
                  <td data-label="Status" className={tdText}>
                    <StatusBadge status={o.status} />
                    {o.handledByName && <div className="mt-1 text-xs text-navy-500">{o.handledByName}</div>}
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
