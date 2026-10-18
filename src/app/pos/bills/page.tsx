import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Receipt } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { listSales } from "@/server/services/sales";
import { ListFilters } from "@/components/pos/list-filters";
import { istRange, Pager, str, type SP } from "@/components/pos/list-utils";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { SaleStatusBadge } from "@/components/pos/sale-status";
import { DateTime, Money } from "@/components/ui/money";
import { EmptyState, PageHeader, PageSkeleton, TableWrap, td, th } from "@/components/ui/page";

export const metadata = { title: "Recent bills" };

export default function BillsPage({ searchParams }: PageProps<"/pos/bills">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Bills searchParams={searchParams} />
    </Suspense>
  );
}

async function Bills({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const actor = await requirePageActor("sales.create");
  const page = Math.max(1, Number(str(sp, "page")) || 1);
  const res = await listSales(actor, {
    q: str(sp, "q") || undefined,
    status: str(sp, "status") || undefined,
    paymentStatus: str(sp, "paymentStatus") || undefined,
    ...istRange(sp),
    includeTraining: true,
    page,
    pageSize: 30,
  });
  const all = can(actor, "sales.view_all");
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Point of sale" title="Recent bills" description={all ? "All sales and bills. Search by sale/bill number, customer, mobile, product, SKU or payment reference." : "Your sales and bills. Search by sale/bill number, customer, mobile, product, SKU or payment reference."} />
      <ListFilters
        initial={{ q: str(sp, "q"), status: str(sp, "status"), paymentStatus: str(sp, "paymentStatus"), from: str(sp, "from"), to: str(sp, "to") }}
        placeholder="Sale / bill no., customer, mobile, SKU, UTR…"
        selects={[
          {
            name: "status",
            label: "Sale status",
            options: [
              { value: "", label: "All statuses" },
              { value: "completed", label: "Completed" },
              { value: "finalized", label: "Awaiting payment" },
              { value: "draft", label: "Draft" },
              { value: "cancelled", label: "Cancelled" },
            ],
          },
          {
            name: "paymentStatus",
            label: "Payment",
            options: [
              { value: "", label: "Any payment" },
              { value: "paid", label: "Paid" },
              { value: "unpaid", label: "Unpaid" },
              { value: "partially_paid", label: "Part paid" },
              { value: "refunded", label: "Refunded" },
              { value: "partially_refunded", label: "Part refunded" },
            ],
          },
        ]}
      />
      {res.items.length === 0 ? (
        <EmptyState icon={<Receipt className="h-10 w-10" />} title="No sales found" description="Try a different search or date range." />
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {res.items.map((s) => (
              <Link key={s.id} href={`/pos/sale/${s.id}`} className="block rounded-2xl border border-navy-100 bg-white p-4 shadow-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold">{s.docNumber ?? s.saleNumber}</span>
                  <Money value={s.grandTotal} className="text-lg font-extrabold" />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <SaleStatusBadge status={s.status} paymentStatus={s.paymentStatus} />
                  {s.status === "completed" && <StatusBadge status={s.paymentStatus} />}
                  {s.isTraining && <Badge tone="red">Training</Badge>}
                </div>
                <div className="mt-1 text-xs text-navy-500">
                  <DateTime value={s.createdAt} /> · {s.customerName ?? "Cash sale"} · {s.itemCount} items
                </div>
              </Link>
            ))}
          </div>
          <TableWrap className="hidden md:block">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Sale</th>
                  <th className={th}>Bill</th>
                  <th className={th}>Date</th>
                  <th className={th}>Customer</th>
                  <th className={`${th} text-right`}>Items</th>
                  <th className={`${th} text-right`}>Total</th>
                  <th className={`${th} text-right`}>Received</th>
                  <th className={th}>Status</th>
                  {all && <th className={th}>Staff</th>}
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {res.items.map((s) => (
                  <tr key={s.id} className="hover:bg-navy-50/50">
                    <td className={td}>
                      <Link href={`/pos/sale/${s.id}`} className="font-mono font-bold text-navy-900 hover:underline">
                        {s.saleNumber}
                      </Link>
                      {s.isTraining && (
                        <Badge tone="red" className="ml-1.5">
                          Training
                        </Badge>
                      )}
                    </td>
                    <td className={td}>
                      {s.docNumber ? (
                        <span className="whitespace-nowrap font-mono text-sm">
                          {s.docNumber}
                          {s.docStatus === "cancelled" && <Badge tone="red" className="ml-1">Cancelled</Badge>}
                        </span>
                      ) : (
                        <span className="text-navy-400">—</span>
                      )}
                    </td>
                    <td className={`${td} text-navy-600`}>
                      <DateTime value={s.createdAt} />
                    </td>
                    <td className={td}>
                      {s.customerName ?? <span className="text-navy-400">Cash sale</span>}
                      {s.customerMobile && <div className="text-xs text-navy-500">{s.customerMobile}</div>}
                    </td>
                    <td className={`${td} text-right tabular`}>{s.itemCount}</td>
                    <td className={`${td} text-right font-bold`}>
                      <Money value={s.grandTotal} />
                    </td>
                    <td className={`${td} text-right`}>
                      <Money value={s.amountPaid} muted />
                      {s.paymentMethods && <div className="text-[11px] uppercase text-navy-400">{s.paymentMethods.replace(/_/g, " ")}</div>}
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        <SaleStatusBadge status={s.status} paymentStatus={s.paymentStatus} />
                        {s.status === "completed" && <StatusBadge status={s.paymentStatus} />}
                      </div>
                    </td>
                    {all && <td className={`${td} text-navy-600`}>{s.createdByName}</td>}
                    <td className={td}>
                      <Link href={`/pos/sale/${s.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:text-gold-600" aria-label={`Open ${s.saleNumber}`}>
                        Open <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Pager path="/pos/bills" sp={sp} page={res.page} pageSize={res.pageSize} total={res.total} />
        </>
      )}
    </div>
  );
}
