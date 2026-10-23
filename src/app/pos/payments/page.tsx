import { Suspense } from "react";
import Link from "next/link";
import { requirePageActor } from "@/server/auth/session";
import { listPayments } from "@/server/services/payments";
import { ListFilters } from "@/components/pos/list-filters";
import { istRange, Pager, str, type SP } from "@/components/pos/list-utils";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { DateTime, Money } from "@/components/ui/money";
import { EmptyState, PageHeader, PageSkeleton, TableWrap, td, th } from "@/components/ui/page";
import { D } from "@/lib/money";

export const metadata = { title: "Payment history" };

const METHOD: Record<string, string> = { upi: "UPI", cash: "Cash", card: "Card", bank_transfer: "Bank transfer", cheque: "Cheque", other: "Other" };
const VERIFY: Record<string, string> = {
  manual_merchant_app: "Merchant app",
  manual_bank_statement: "Bank statement",
  cash_counted: "Cash counted",
  gateway_webhook: "Gateway (automatic)",
  gateway_api: "Gateway (automatic)",
  manual_other: "Checked manually",
};

export default function PaymentsPage({ searchParams }: PageProps<"/pos/payments">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Payments searchParams={searchParams} />
    </Suspense>
  );
}

async function Payments({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const actor = await requirePageActor("payments.view");
  const page = Math.max(1, Number(str(sp, "page")) || 1);
  const direction = str(sp, "direction");
  const res = await listPayments(actor, {
    q: str(sp, "q") || undefined,
    status: str(sp, "status") || undefined,
    method: str(sp, "method") || undefined,
    direction: direction === "in" || direction === "refund" ? direction : undefined,
    ...istRange(sp),
    includeTraining: true,
    page,
    pageSize: 50,
  });
  const verifiedIn = res.items.filter((p) => p.status === "successful" && p.direction === "in").reduce((a, p) => a.plus(D(p.amount)), D(0));
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Point of sale"
        title="Payment history"
        description="Every QR shown and every payment confirmed. A QR that was shown is NOT a payment until someone verifies it."
      />
      <ListFilters
        initial={{ q: str(sp, "q"), status: str(sp, "status"), method: str(sp, "method"), direction, from: str(sp, "from"), to: str(sp, "to") }}
        placeholder="UTR / reference, sale no., customer, mobile…"
        selects={[
          {
            name: "status",
            label: "Status",
            options: [
              { value: "", label: "All statuses" },
              { value: "successful", label: "Verified" },
              { value: "initiated", label: "QR shown — not verified" },
              { value: "failed", label: "Failed" },
              { value: "cancelled", label: "Cancelled" },
              { value: "expired", label: "Expired" },
              { value: "reversed", label: "Reversed" },
            ],
          },
          {
            name: "method",
            label: "Method",
            options: [{ value: "", label: "All methods" }, ...Object.entries(METHOD).map(([value, label]) => ({ value, label }))],
          },
          {
            name: "direction",
            label: "Direction",
            options: [
              { value: "", label: "Received & refunds" },
              { value: "in", label: "Received" },
              { value: "refund", label: "Refunds" },
            ],
          },
        ]}
      />
      {res.items.length === 0 ? (
        <EmptyState title="No payments found" />
      ) : (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-navy-600">
            <span className="label-mono text-navy-500">Verified receipts on this page</span>
            <Money value={verifiedIn.toFixed(2)} className="font-mono font-semibold text-navy-950" />
          </p>
          <ul className="divide-y divide-navy-100 overflow-hidden rounded-xl border border-navy-200 bg-white shadow-card md:hidden">
            {res.items.map((p) => (
              <li key={p.id}>
                <Link href={`/pos/sale/${p.saleId}`} className="block px-4 py-3.5 transition-colors active:bg-paper">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-navy-950">{p.saleNumber}</span>
                    <Money value={p.amount} className={`font-mono text-[15px] font-semibold ${p.status === "successful" ? "text-navy-950" : "text-navy-400"}`} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={p.status} />
                    {p.direction === "refund" && <Badge tone="purple">Refund</Badge>}
                    <Badge tone="navy">{METHOD[p.method] ?? p.method}</Badge>
                    {p.isTraining && <Badge tone="red">Training</Badge>}
                  </div>
                  <div className="mt-1.5 text-xs text-navy-500">
                    <DateTime value={p.verifiedAt ?? p.createdAt} /> · {p.customerName ?? "No customer"}
                    {p.reference && <span className="font-mono"> · {p.reference}</span>}
                  </div>
                  {p.verificationMethod && (
                    <div className="mt-0.5 text-xs text-navy-500">
                      Verified by {p.verifiedByName ?? "System"} · {VERIFY[p.verificationMethod]}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          <TableWrap className="hidden md:block">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Sale</th>
                  <th className={th}>Customer</th>
                  <th className={th}>Method</th>
                  <th className={th}>Reference</th>
                  <th className={th}>Status</th>
                  <th className={th}>Verified by</th>
                  <th className={`${th} text-right`}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {res.items.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-paper/60">
                    <td className={`${td} text-[13px] text-navy-600`}>
                      <DateTime value={p.verifiedAt ?? p.createdAt} />
                    </td>
                    <td className={td}>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Link href={`/pos/sale/${p.saleId}`} className="link-draw font-mono font-semibold text-navy-950">
                          {p.saleNumber}
                        </Link>
                        {p.isTraining && <Badge tone="red">Training</Badge>}
                      </span>
                    </td>
                    <td className={td}>{p.customerName ?? <span className="text-navy-300">—</span>}</td>
                    <td className={td}>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {p.direction === "refund" && <Badge tone="purple">Refund</Badge>}
                        {METHOD[p.method] ?? p.method}
                      </span>
                    </td>
                    <td className={`${td} font-mono text-xs text-navy-700`}>{p.reference ?? <span className="text-navy-300">—</span>}</td>
                    <td className={td}>
                      <StatusBadge status={p.status} />
                    </td>
                    <td className={`${td} text-xs text-navy-700`}>
                      {p.verificationMethod ? (
                        <>
                          {p.verifiedByName ?? "System"}
                          <div className="mt-0.5 text-navy-400">{VERIFY[p.verificationMethod]}</div>
                        </>
                      ) : (
                        <span className="text-navy-300">—</span>
                      )}
                    </td>
                    <td className={`${td} text-right`}>
                      <Money value={p.amount} className={`font-mono font-semibold ${p.status === "successful" ? "text-navy-950" : "text-navy-400"}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Pager path="/pos/payments" sp={sp} page={res.page} pageSize={res.pageSize} total={res.total} />
        </>
      )}
    </div>
  );
}
