import { Suspense } from "react";
import Link from "next/link";
import { requirePageActor } from "@/server/auth/session";
import { queryAudit } from "@/server/services/audit-log";
import { PageHeader, PageSkeleton, TableWrap, td, th } from "@/components/ui/page";
import { Badge, type Tone } from "@/components/ui/badge";
import { DateTime } from "@/components/ui/money";
import { AuditFilters } from "@/components/dashboard/admin/audit-filters";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

export const metadata = { title: "Audit log" };

const ACTION_TONE: [RegExp, Tone][] = [
  [/^auth\.(login_failed|account_locked|approver_check_failed)|webhook_rejected|reversed|cancel|_rejected|deactivate/, "red"],
  [/^(price|cost)\./, "gold"],
  [/^(discount|payment)\./, "green"],
  [/^(user|role|settings)\./, "purple"],
  [/^document\./, "navy"],
];

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
  const pages = Math.max(1, Math.ceil(res.total / res.pageSize));
  const pageHref = (p: number) => {
    const n = new URLSearchParams(q);
    n.set("page", String(p));
    return `/dashboard/audit?${n.toString()}`;
  };
  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        description="An append-only record of sign-ins, permission changes, price and cost changes, discount approvals, payment confirmations, bills, cancellations, refunds and settings. Entries cannot be edited or deleted."
      />
      <AuditFilters />
      <TableWrap>
        <table className="w-full">
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
                <tr key={a.id}>
                  <td className={cn(td, "whitespace-nowrap text-xs")}>
                    <DateTime value={a.at} />
                  </td>
                  <td className={cn(td, "text-xs")}>
                    <div className="font-semibold">{a.actorLabel}</div>
                    {a.ip && <div className="text-navy-400">{a.ip}</div>}
                  </td>
                  <td className={td}>
                    <Badge tone={toneFor(a.action)}>{a.action}</Badge>
                  </td>
                  <td className={td}>
                    <div>{a.summary}</div>
                    <div className="mt-0.5 flex flex-wrap gap-3 text-xs">
                      {link && (
                        <Link href={link} className="font-semibold text-navy-600 hover:underline">
                          Open {a.entityType}
                        </Link>
                      )}
                      {a.data != null && (
                        <details className="w-full">
                          <summary className="cursor-pointer text-navy-500">Details</summary>
                          <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-navy-50 p-2 text-[11px] leading-snug text-navy-800">{JSON.stringify(a.data, null, 2)}</pre>
                        </details>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!res.items.length && (
              <tr>
                <td className={td} colSpan={4}>
                  No audit entries match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableWrap>
      <div className="mt-4 flex items-center justify-between text-sm text-navy-600">
        <span>
          {res.total.toLocaleString("en-IN")} entries · page {page} of {pages}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className={buttonClass("outline", "sm")}>
              Previous
            </Link>
          )}
          {page < pages && (
            <Link href={pageHref(page + 1)} className={buttonClass("outline", "sm")}>
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
