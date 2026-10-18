import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { listSales } from "@/server/services/sales";
import { listStaffOptions } from "@/components/dashboard/ops/staff-options";
import { EmptyState, PageHeader, PageSkeleton, TableWrap, td, th } from "@/components/ui/page";
import { LinkButton } from "@/components/ui/button";
import { Money, DateTime } from "@/components/ui/money";
import { Badge, SampleBadge, StatusBadge } from "@/components/ui/badge";
import { FilterBar, type FilterField } from "@/components/dashboard/ops/filter-bar";
import { Pagination } from "@/components/dashboard/ops/pagination";
import { CsvExportButton } from "@/components/dashboard/ops/csv-export";
import { dayRange, num, str, type SearchParams } from "@/components/dashboard/ops/params";

export const metadata = { title: "Sales & bills" };

export default function SalesPage({ searchParams }: PageProps<"/dashboard/sales">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SalesList searchParams={searchParams} />
    </Suspense>
  );
}

async function SalesList({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePageActor(["sales.view_all", "sales.create"]);
  const sp = await searchParams;
  const viewAll = can(actor, "sales.view_all");
  const page = num(sp, "page", 1);
  const pageSize = 30;
  const { from, to } = dayRange(sp);
  const data = await listSales(actor, {
    q: str(sp, "q"),
    status: str(sp, "status"),
    paymentStatus: str(sp, "payment"),
    staffId: viewAll ? str(sp, "staff") : undefined,
    from,
    to,
    includeTraining: str(sp, "training") === "1",
    page,
    pageSize,
  });
  const staff = viewAll ? await listStaffOptions() : [];

  const fields: FilterField[] = [
    { kind: "search", name: "q", placeholder: "Sale no., bill no., customer, mobile, SKU or payment ref" },
    {
      kind: "select",
      name: "status",
      label: "Sale status",
      options: [
        { value: "", label: "All" },
        { value: "draft", label: "Draft" },
        { value: "finalized", label: "Awaiting payment" },
        { value: "completed", label: "Completed" },
        { value: "cancelled", label: "Cancelled" },
      ],
    },
    {
      kind: "select",
      name: "payment",
      label: "Payment",
      options: [
        { value: "", label: "All" },
        { value: "unpaid", label: "Unpaid" },
        { value: "partially_paid", label: "Part paid" },
        { value: "paid", label: "Paid" },
        { value: "partially_refunded", label: "Part refunded" },
        { value: "refunded", label: "Refunded" },
      ],
    },
    ...(viewAll ? [{ kind: "select" as const, name: "staff", label: "Staff", options: [{ value: "", label: "Everyone" }, ...staff.map((s) => ({ value: s.id, label: s.name }))] }] : []),
    { kind: "date", name: "from", label: "From" },
    { kind: "date", name: "to", label: "To" },
    { kind: "toggle", name: "training", label: "Include training" },
  ];

  const csvRows = data.items.map((s) => ({
    sale_no: s.saleNumber,
    date: s.createdAt.toISOString(),
    customer: s.customerName ?? "",
    mobile: s.customerMobile ?? "",
    items: s.itemCount,
    total: s.grandTotal,
    paid: s.amountPaid,
    refunded: s.amountRefunded,
    status: s.status,
    payment_status: s.paymentStatus,
    bill_no: s.docNumber ?? "",
    bill_status: s.docStatus ?? "",
    staff: s.createdByName,
    training: s.isTraining ? "yes" : "no",
  }));

  return (
    <div>
      <PageHeader
        title="Sales & bills"
        description={viewAll ? "Every sale across the shop, with its payment and billing status." : "Your sales, with their payment and billing status."}
        actions={
          <>
            {can(actor, "reports.export") && <CsvExportButton rows={csvRows} filename={`om-sales-page-${page}.csv`} label="Export page (CSV)" />}
            {can(actor, "sales.create") && (
              <LinkButton href="/pos" variant="gold" icon={<Plus className="h-4 w-4" />}>
                New sale
              </LinkButton>
            )}
          </>
        }
      />
      <FilterBar fields={fields} values={Object.fromEntries(["q", "status", "payment", "staff", "from", "to", "training"].map((k) => [k, str(sp, k)]))} />
      {data.items.length === 0 ? (
        <EmptyState title="No sales found" description={str(sp, "training") ? "Try different filters." : "No real sales match these filters. Training (sample) sales are hidden unless you tick “Include training”."} />
      ) : (
        <TableWrap>
          <table className="w-full min-w-[980px]">
            <thead>
              <tr>
                <th className={th}>Sale</th>
                <th className={th}>Date</th>
                <th className={th}>Customer</th>
                <th className={`${th} text-right`}>Items</th>
                <th className={`${th} text-right`}>Total</th>
                <th className={`${th} text-right`}>Paid</th>
                <th className={th}>Status</th>
                <th className={th}>Bill</th>
                {viewAll && <th className={th}>Staff</th>}
              </tr>
            </thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s.id} className="hover:bg-navy-50/50">
                  <td className={td}>
                    <Link href={`/dashboard/sales/${s.id}`} className="font-semibold text-navy-900 underline-offset-2 hover:underline">
                      {s.saleNumber}
                    </Link>
                    {s.isTraining && <SampleBadge label="Training" className="ml-1.5" />}
                  </td>
                  <td className={`${td} text-navy-600`}>
                    <DateTime value={s.createdAt} />
                  </td>
                  <td className={td}>
                    <div className="max-w-[200px] truncate">{s.customerName ?? <span className="text-navy-400">Walk-in</span>}</div>
                    {s.customerMobile && <div className="text-xs text-navy-500">{s.customerMobile}</div>}
                  </td>
                  <td className={`${td} text-right tabular`}>{s.itemCount}</td>
                  <td className={`${td} text-right font-semibold`}>
                    <Money value={s.grandTotal} />
                  </td>
                  <td className={`${td} text-right`}>
                    <Money value={s.amountPaid} muted={s.amountPaid === "0.00"} />
                    {s.amountRefunded !== "0.00" && <div className="text-xs text-violet-700">− <Money value={s.amountRefunded} /> refunded</div>}
                  </td>
                  <td className={td}>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={s.status} />
                      {s.status !== "draft" && s.status !== "cancelled" && <StatusBadge status={s.paymentStatus} />}
                      {s.approvalStatus === "pending" && <Badge tone="amber">Approval pending</Badge>}
                    </div>
                  </td>
                  <td className={td}>
                    {s.docNumber ? (
                      <div>
                        <div className="whitespace-nowrap font-medium tabular">{s.docNumber}</div>
                        {s.docStatus === "cancelled" && <StatusBadge status="cancelled" />}
                      </div>
                    ) : (
                      <span className="text-navy-400">—</span>
                    )}
                  </td>
                  {viewAll && <td className={`${td} text-navy-600`}>{s.createdByName}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <Pagination total={data.total} page={page} pageSize={pageSize} sp={sp} basePath="/dashboard/sales" />
    </div>
  );
}
