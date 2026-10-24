import { Suspense } from "react";
import Link from "next/link";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { listPayments, pendingPayments } from "@/server/services/payments";
import { D, formatINR, m } from "@/lib/money";
import { Stat } from "@/components/ui/card";
import { EmptyState, PageHeader, PageSkeleton, TableWrap } from "@/components/ui/page";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { CASH_SALE, TrainingBadge } from "@/components/staff/labels";
import { DateTime, Money } from "@/components/ui/money";
import { cn } from "@/components/ui/cn";
import { FilterBar, type FilterField } from "@/components/dashboard/ops/filter-bar";
import { Pagination } from "@/components/dashboard/ops/pagination";
import { CsvExportButton } from "@/components/dashboard/ops/csv-export";
import { dayRange, num, str, type SearchParams } from "@/components/dashboard/ops/params";
import { METHOD_LABEL, VERIFICATION_LABEL } from "@/components/dashboard/ops/guard";
import { codeLink, rowHover, tdCode, tdMuted, tdNum, tdText, th, thNum } from "@/components/dashboard/table";

export const metadata = { title: "Payments" };

export default function PaymentsPage({ searchParams }: PageProps<"/dashboard/payments">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Payments searchParams={searchParams} />
    </Suspense>
  );
}

function Tabs({ view }: { view: "history" | "pending" }) {
  const tab = (active: boolean) =>
    cn(
      "-mb-px whitespace-nowrap border-b-2 px-1 pb-2.5 pt-1 text-sm font-semibold transition-colors duration-150",
      active ? "border-gold-500 text-navy-950" : "border-transparent text-navy-500 hover:border-navy-200 hover:text-navy-900",
    );
  return (
    <div className="no-print mb-5 flex gap-6 border-b border-navy-200" role="tablist">
      <Link href="/dashboard/payments" className={tab(view === "history")} role="tab" aria-selected={view === "history"}>
        Payment history
      </Link>
      <Link href="/dashboard/payments?view=pending" className={tab(view === "pending")} role="tab" aria-selected={view === "pending"}>
        Awaiting payment
      </Link>
    </div>
  );
}

async function Payments({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePageActor("payments.view");
  const sp = await searchParams;
  const view = str(sp, "view") === "pending" ? "pending" : "history";

  if (view === "pending") {
    const rows = await pendingPayments(actor);
    const outstanding = rows.reduce((a, r) => a.plus(D(r.grandTotal).minus(D(r.amountPaid))), D(0));
    return (
      <div>
        <PageHeader eyebrow="Sales" title="Payments" description="Finalised sales where the agreed amount has not been fully received yet (training sales excluded)." />
        <Tabs view="pending" />
        <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Sales awaiting payment" value={rows.length.toLocaleString("en-IN")} />
          <Stat label="Outstanding" value={formatINR(m(outstanding))} tone={rows.length ? "gold" : "navy"} hint="Agreed totals less money received" />
        </div>
        {rows.length === 0 ? (
          <EmptyState title="Nothing outstanding" description="Every finalised sale has been paid in full." />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[720px]">
              <thead>
                <tr>
                  <th className={th}>Sale</th>
                  <th className={th}>Finalised</th>
                  <th className={th}>Customer</th>
                  <th className={thNum}>Agreed total</th>
                  <th className={thNum}>Received</th>
                  <th className={thNum}>Outstanding</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={rowHover}>
                    <td className={tdText}>
                      <Link href={`/dashboard/sales/${r.id}`} className={codeLink}>
                        {r.saleNumber}
                      </Link>
                    </td>
                    <td className={`${tdMuted} whitespace-nowrap`}>
                      <DateTime value={r.finalizedAt} />
                    </td>
                    <td className={tdText}>{r.customerName ?? <span className="text-navy-400">{CASH_SALE}</span>}</td>
                    <td className={tdNum}>
                      <Money value={r.grandTotal} />
                    </td>
                    <td className={tdNum}>
                      <Money value={r.amountPaid} muted={r.amountPaid === "0.00"} />
                    </td>
                    <td className={`${tdNum} font-semibold`}>
                      <span className="text-amber-700">{formatINR(m(D(r.grandTotal).minus(D(r.amountPaid))))}</span>
                    </td>
                    <td className={tdText}>
                      <StatusBadge status={r.status === "completed" ? "partially_paid" : D(r.amountPaid).isZero() ? "unpaid" : "partially_paid"} />
                      {r.status === "completed" && <div className="mt-1 text-xs text-navy-500">Billed on credit</div>}
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

  const page = num(sp, "page", 1);
  const pageSize = 50;
  const { from, to } = dayRange(sp);
  const direction = str(sp, "direction");
  const data = await listPayments(actor, {
    q: str(sp, "q"),
    status: str(sp, "status"),
    method: str(sp, "method"),
    direction: direction === "in" || direction === "refund" ? direction : undefined,
    from,
    to,
    includeTraining: str(sp, "training") === "1",
    page,
    pageSize,
  });
  const verified = data.items.filter((p) => p.status === "successful");
  const received = verified.filter((p) => p.direction === "in").reduce((a, p) => a.plus(D(p.amount)), D(0));
  const refunded = verified.filter((p) => p.direction === "refund").reduce((a, p) => a.plus(D(p.amount)), D(0));
  const unverified = data.items.filter((p) => p.status === "initiated" || p.status === "pending");

  const fields: FilterField[] = [
    { kind: "search", name: "q", placeholder: "UTR / reference, sale no., customer name or mobile" },
    {
      kind: "select",
      name: "status",
      label: "Status",
      options: [
        { value: "", label: "All" },
        { value: "successful", label: "Verified" },
        { value: "initiated", label: "QR shown — not verified" },
        { value: "failed", label: "Failed" },
        { value: "expired", label: "Expired" },
        { value: "cancelled", label: "Cancelled" },
        { value: "reversed", label: "Reversed" },
      ],
    },
    {
      kind: "select",
      name: "method",
      label: "Method",
      options: [{ value: "", label: "All" }, ...Object.entries(METHOD_LABEL).filter(([k]) => k !== "other").map(([value, label]) => ({ value, label }))],
    },
    {
      kind: "select",
      name: "direction",
      label: "Direction",
      options: [
        { value: "", label: "All" },
        { value: "in", label: "Received" },
        { value: "refund", label: "Refunds" },
      ],
    },
    { kind: "date", name: "from", label: "From" },
    { kind: "date", name: "to", label: "To" },
    { kind: "toggle", name: "training", label: "Include training" },
  ];

  const csvRows = data.items.map((p) => ({
    date: (p.verifiedAt ?? p.createdAt).toISOString(),
    sale_no: p.saleNumber,
    customer: p.customerName ?? "",
    direction: p.direction,
    method: p.method,
    reference: p.reference ?? "",
    amount: p.amount,
    status: p.status,
    verification: p.verificationMethod ?? "",
    verified_by: p.verifiedByName ?? "",
    training: p.isTraining ? "yes" : "no",
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Sales"
        title="Payments"
        description="Every payment request and verification. Money counts as received only after staff verify it (or the gateway confirms it)."
        actions={can(actor, "reports.export") ? <CsvExportButton rows={csvRows} filename={`om-payments-page-${page}.csv`} label="Export page (CSV)" /> : null}
      />
      <Tabs view="history" />
      <FilterBar fields={fields} values={Object.fromEntries(["q", "status", "method", "direction", "from", "to", "training"].map((k) => [k, str(sp, k)]))} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Verified received (shown)" value={formatINR(m(received))} tone="green" />
        <Stat label="Refunded (shown)" value={formatINR(m(refunded))} tone={refunded.isZero() ? "navy" : "red"} />
        <Stat label="Unverified QR requests (shown)" value={unverified.length.toLocaleString("en-IN")} tone={unverified.length ? "gold" : "navy"} hint="Not money received" />
      </div>
      {data.items.length === 0 ? (
        <EmptyState title="No payments found" description={str(sp, "training") ? "Try different filters." : "Training (sample) payments are hidden unless you tick “Include training”."} />
      ) : (
        <TableWrap>
          <table className="w-full min-w-[960px]">
            <thead>
              <tr>
                <th className={th}>When</th>
                <th className={th}>Sale</th>
                <th className={th}>Customer</th>
                <th className={th}>Method</th>
                <th className={th}>Reference</th>
                <th className={th}>Verification</th>
                <th className={th}>Status</th>
                <th className={thNum}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id} className={rowHover}>
                  <td className={`${tdMuted} whitespace-nowrap`}>
                    <DateTime value={p.verifiedAt ?? p.createdAt} />
                  </td>
                  <td className={tdText}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/dashboard/sales/${p.saleId}`} className={codeLink}>
                        {p.saleNumber}
                      </Link>
                      {p.isTraining && <TrainingBadge />}
                    </span>
                  </td>
                  <td className={tdText}>{p.customerName ?? <span className="text-navy-400">{CASH_SALE}</span>}</td>
                  <td className={tdText}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {p.direction === "refund" && <Badge tone="purple">Refund</Badge>}
                      {METHOD_LABEL[p.method] ?? p.method}
                    </span>
                    {p.provider === "razorpay" && <div className="text-xs text-navy-500">Razorpay</div>}
                  </td>
                  <td className={tdCode}>{p.reference ?? <span className="text-navy-300">—</span>}</td>
                  <td className={`${tdMuted} text-xs`}>
                    {p.verificationMethod ? VERIFICATION_LABEL[p.verificationMethod] ?? p.verificationMethod : <span className="text-amber-700">Not verified</span>}
                    {p.verifiedByName && <div>by {p.verifiedByName}</div>}
                    {p.status === "reversed" && p.reversalReason && <div className="text-red-700">Reversed: {p.reversalReason}</div>}
                  </td>
                  <td className={tdText}>
                    <StatusBadge status={p.status} />
                  </td>
                  <td className={`${tdNum} font-semibold`}>
                    <span className={cn(p.direction === "refund" && "text-violet-700", p.status !== "successful" && "text-navy-400")}>
                      {p.direction === "refund" ? "− " : ""}
                      <Money value={p.amount} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <Pagination total={data.total} page={page} pageSize={pageSize} sp={sp} basePath="/dashboard/payments" />
    </div>
  );
}
