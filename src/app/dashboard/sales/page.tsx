import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { listSales } from "@/server/services/sales";
import { listStaffOptions } from "@/components/dashboard/ops/staff-options";
import { EmptyState, PageHeader, PageSkeleton, TableWrap } from "@/components/ui/page";
import { LinkButton } from "@/components/ui/button";
import { Money, DateTime } from "@/components/ui/money";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { CASH_SALE, TrainingBadge } from "@/components/staff/labels";
import { FilterBar, type FilterField } from "@/components/dashboard/ops/filter-bar";
import { Pagination } from "@/components/dashboard/ops/pagination";
import { CsvExportButton } from "@/components/dashboard/ops/csv-export";
import { dayRange, num, str, type SearchParams } from "@/components/dashboard/ops/params";
import { codeLink, rowHover, tdCode, tdMuted, tdNum, tdText, th, thNum } from "@/components/dashboard/table";

export const metadata = { title: "Sales & bills" };

const PAYMENT_LABEL: Record<string, string> = {
  partially_paid: "Part paid",
  paid: "Paid",
  partially_refunded: "Part refunded",
  refunded: "Refunded",
};

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
        eyebrow="Sales"
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
                <th className={thNum}>Items</th>
                <th className={thNum}>Total</th>
                <th className={thNum}>Paid</th>
                <th className={th}>Status</th>
                <th className={th}>Bill</th>
                {viewAll && <th className={th}>Staff</th>}
              </tr>
            </thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s.id} className={rowHover}>
                  <td className={tdText}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/dashboard/sales/${s.id}`} className={codeLink}>
                        {s.saleNumber}
                      </Link>
                      {s.isTraining && <TrainingBadge />}
                    </span>
                  </td>
                  <td className={`${tdMuted} whitespace-nowrap`}>
                    <DateTime value={s.createdAt} />
                  </td>
                  <td className={tdText}>
                    <div className="max-w-[200px] truncate">{s.customerName ?? <span className="text-navy-400">{CASH_SALE}</span>}</div>
                    {s.customerMobile && <div className="font-mono text-xs text-navy-500">{s.customerMobile}</div>}
                  </td>
                  <td className={tdNum}>{s.itemCount}</td>
                  <td className={`${tdNum} font-semibold`}>
                    <Money value={s.grandTotal} />
                  </td>
                  <td className={tdNum}>
                    <Money value={s.amountPaid} muted={s.amountPaid === "0.00"} />
                    {s.amountRefunded !== "0.00" && (
                      <div className="mt-0.5 text-xs text-violet-700">
                        − <Money value={s.amountRefunded} /> refunded
                      </div>
                    )}
                  </td>
                  <td className={tdText}>
                    <div className="flex flex-col items-start gap-1">
                      {/* A completed sale is described by its payment state; otherwise by the sale state. */}
                      <StatusBadge status={s.status === "completed" ? s.paymentStatus : s.status} />
                      {s.status === "finalized" && s.paymentStatus !== "unpaid" && <span className="text-xs text-navy-500">{PAYMENT_LABEL[s.paymentStatus] ?? s.paymentStatus}</span>}
                      {s.approvalStatus === "pending" && <Badge tone="amber">Approval pending</Badge>}
                    </div>
                  </td>
                  <td className={s.docNumber ? tdCode : tdText}>
                    {s.docNumber ? (
                      <div>
                        <div>{s.docNumber}</div>
                        {s.docStatus === "cancelled" && <StatusBadge status="cancelled" className="mt-1" />}
                      </div>
                    ) : (
                      <span className="text-navy-300">—</span>
                    )}
                  </td>
                  {viewAll && <td className={tdMuted}>{s.createdByName}</td>}
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
