import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { listSales } from "@/server/services/sales";
import { ListFilters } from "@/components/pos/list-filters";
import { istRange, Pager, str, type SP } from "@/components/pos/list-utils";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { CASH_SALE, TrainingBadge } from "@/components/staff/labels";
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
        <EmptyState title="No sales found" description="Try a different search or date range." />
      ) : (
        <>
          <ul className="divide-y divide-navy-100 overflow-hidden rounded-xl border border-navy-200 bg-white shadow-card md:hidden">
            {res.items.map((s) => (
              <li key={s.id}>
                <Link href={`/pos/sale/${s.id}`} className="block px-4 py-3.5 transition-colors active:bg-paper">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-sm font-semibold text-navy-950">{s.docNumber ?? s.saleNumber}</span>
                    <Money value={s.grandTotal} className="font-mono text-[15px] font-semibold text-navy-950" />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <SaleStatusBadge status={s.status} paymentStatus={s.paymentStatus} />
                    {s.status === "completed" && <StatusBadge status={s.paymentStatus} />}
                    {s.isTraining && <TrainingBadge />}
                  </div>
                  <div className="mt-1.5 text-xs text-navy-500">
                    <DateTime value={s.createdAt} /> · {s.customerName ?? CASH_SALE} · {s.itemCount} item{s.itemCount === 1 ? "" : "s"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
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
                  <tr key={s.id} className="transition-colors hover:bg-paper/60">
                    <td className={td}>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Link href={`/pos/sale/${s.id}`} className="link-draw font-mono font-semibold text-navy-950">
                          {s.saleNumber}
                        </Link>
                        {s.isTraining && <TrainingBadge />}
                      </span>
                    </td>
                    <td className={td}>
                      {s.docNumber ? (
                        <span className="flex flex-wrap items-center gap-1.5 whitespace-nowrap font-mono text-[13px] text-navy-800">
                          {s.docNumber}
                          {s.docStatus === "cancelled" && <Badge tone="red">Cancelled</Badge>}
                        </span>
                      ) : (
                        <span className="text-navy-300">—</span>
                      )}
                    </td>
                    <td className={`${td} text-[13px] text-navy-600`}>
                      <DateTime value={s.createdAt} />
                    </td>
                    <td className={td}>
                      {s.customerName ?? <span className="text-navy-400">{CASH_SALE}</span>}
                      {s.customerMobile && <div className="font-mono text-xs text-navy-500">{s.customerMobile}</div>}
                    </td>
                    <td className={`${td} text-right font-mono tabular`}>{s.itemCount}</td>
                    <td className={`${td} text-right`}>
                      <Money value={s.grandTotal} className="font-mono font-semibold text-navy-950" />
                    </td>
                    <td className={`${td} text-right`}>
                      <Money value={s.amountPaid} muted className="font-mono" />
                      {s.paymentMethods && <div className="label-mono mt-0.5 text-[10px] text-navy-400">{s.paymentMethods.replace(/_/g, " ")}</div>}
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        <SaleStatusBadge status={s.status} paymentStatus={s.paymentStatus} />
                        {s.status === "completed" && <StatusBadge status={s.paymentStatus} />}
                      </div>
                    </td>
                    {all && <td className={`${td} text-[13px] text-navy-600`}>{s.createdByName}</td>}
                    <td className={`${td} text-right`}>
                      <Link
                        href={`/pos/sale/${s.id}`}
                        className="group inline-flex items-center gap-1 text-[13px] font-semibold text-navy-700 transition-colors hover:text-navy-950"
                        aria-label={`Open ${s.saleNumber}`}
                      >
                        Open <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
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
