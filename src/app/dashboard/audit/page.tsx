import { Suspense } from "react";
import Link from "next/link";
import { requirePageActor } from "@/server/auth/session";
import { queryAudit } from "@/server/services/audit-log";
import { PageHeader, PageSkeleton, TableWrap } from "@/components/ui/page";
import type { Tone } from "@/components/ui/badge";
import { DateTime } from "@/components/ui/money";
import { AuditFilters } from "@/components/dashboard/admin/audit-filters";
import { Pagination } from "@/components/dashboard/ops/pagination";
import { rowHover, tdMuted, tdText, th } from "@/components/dashboard/table";
import { actorLabel } from "@/components/staff/labels";

export const metadata = { title: "Audit log" };

const ACTION_TONE: [RegExp, Tone][] = [
  [/^auth\.(login_failed|account_locked|approver_check_failed)|webhook_rejected|reversed|cancel|_rejected|deactivate/, "red"],
  [/^(price|cost)\./, "amber"],
  [/^(discount|payment)\./, "green"],
  [/^(user|role|settings)\./, "navy"],
  [/^document\./, "navy"],
];

// The action code is set in mono with a coloured dot, not a badge on every row.
const DOT: Record<Tone, string> = {
  red: "bg-red-600",
  gold: "bg-amber-500",
  green: "bg-emerald-600",
  purple: "bg-navy-700",
  navy: "bg-navy-700",
  neutral: "bg-navy-300",
  amber: "bg-amber-500",
  blue: "bg-navy-700",
};

function toneFor(action: string): Tone {
  return ACTION_TONE.find(([re]) => re.test(action))?.[1] ?? "neutral";
}

function entityLink(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  switch (type) {
    case "sale":
      return `/dashboard/sales/${id}`;
    case "document":
      return `/dashboard/documents/${id}`;
    case "product":
      return `/dashboard/products/${id}`;
    case "customer":
      return `/dashboard/customers/${id}`;
    case "website_order":
      return `/dashboard/orders/${id}`;
    default:
      return null;
  }
}

export default function AuditPage(props: PageProps<"/dashboard/audit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Audit searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Audit({ searchParams }: { searchParams: PageProps<"/dashboard/audit">["searchParams"] }) {
  const actor = await requirePageActor("audit.view");
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k, v);
  const page = Math.max(1, Number(q.get("page")) || 1);
  const res = await queryAudit(actor, {
    q: q.get("q") ?? undefined,
    action: q.get("action") ?? undefined,
    entityType: q.get("entityType") ?? undefined,
    entityId: q.get("entityId") ?? undefined,
    from: q.get("from") ? new Date(`${q.get("from")}T00:00:00+05:30`) : undefined,
    to: q.get("to") ? new Date(new Date(`${q.get("to")}T00:00:00+05:30`).getTime() + 86400_000) : undefined,
    page,
    pageSize: 100,
  });
  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        description="An append-only record of sign-ins, permission changes, price and cost changes, discount approvals, payment confirmations, bills, cancellations, refunds and settings. Entries cannot be edited or deleted."
      />
      <AuditFilters />
      <TableWrap>
        <table className="stack-sm w-full min-w-[760px]">
          <thead>
            <tr>
              <th className={th}>When</th>
              <th className={th}>Who</th>
              <th className={th}>Action</th>
              <th className={th}>What happened</th>
            </tr>
          </thead>
          <tbody>
            {res.items.map((a) => {
              const link = entityLink(a.entityType, a.entityId);
              return (
                <tr key={a.id} className={rowHover}>
                  <td data-label="When" className={`${tdMuted} whitespace-nowrap text-xs`}>
                    <DateTime value={a.at} />
                  </td>
                  <td data-label="Who" className={`${tdText} text-xs`}>
                    <div className="font-semibold">{actorLabel(a.actorLabel)}</div>
                    {a.ip && <div className="mt-0.5 tabular text-[11px] text-navy-400">{a.ip}</div>}
                  </td>
                  <td data-label="Action" className={tdText}>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular text-[12px] text-navy-700">
                      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[toneFor(a.action)]}`} />
                      {a.action}
                    </span>
                  </td>
                  <td data-label="What happened" className={tdText}>
                    <div className="leading-snug">{a.summary}</div>
                    {(link || a.data != null) && (
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {link && (
                          <Link href={link} className="font-semibold text-navy-600 underline-offset-[3px] hover:text-navy-950 hover:underline">
                            Open {a.entityType}
                          </Link>
                        )}
                        {a.data != null && (
                          <details className="group w-full">
                            <summary className="cursor-pointer text-navy-500 transition-colors hover:text-navy-900">Details</summary>
                            <pre className="mt-1.5 max-h-64 overflow-auto rounded-md border border-rule bg-paper/70 p-2.5 tabular text-[11px] leading-snug text-navy-800">{JSON.stringify(a.data, null, 2)}</pre>
                          </details>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!res.items.length && (
              <tr>
                <td className={tdMuted} colSpan={4}>
                  No audit entries match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableWrap>
      <Pagination total={res.total} page={page} pageSize={res.pageSize} sp={sp} basePath="/dashboard/audit" />
    </div>
  );
}
