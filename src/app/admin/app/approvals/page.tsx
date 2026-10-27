import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { can } from "@/server/auth/actor";
import { ownerLang } from "@/server/owner-lang";
import { listPendingApprovals } from "@/server/services/sales";
import { ownerWaiting } from "@/server/services/owner";
import { requireOwner } from "../guard";
import { formatINR } from "@/lib/money";
import { ApprovalActions } from "@/components/owner/approval-actions";

export const metadata = { title: "Approvals" };

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-navy-100/60" />}>
      <Approvals />
    </Suspense>
  );
}

type Details = { grandTotal?: string; listTotal?: string; maxDiscountPercent?: string; lines?: { name: string; quantity: string; unit: string; netAmount: string; discountPercent: string }[] };

async function Approvals() {
  const actor = await requireOwner();
  const { t } = await ownerLang();
  const [requests, waiting] = await Promise.all([can(actor, "discounts.approve") ? listPendingApprovals(actor) : [], ownerWaiting(actor)]);
  const labels = { approve: t("approve"), reject: t("reject"), rejectNote: t("rejectNote"), approved: t("approved"), rejected: t("rejected") };
  const nothing = !requests.length && !waiting.prices && !waiting.orders;

  return (
    <div className="space-y-5">
      <Link href="/admin/app" className="inline-flex items-center gap-1 text-sm font-semibold text-navy-600">
        <ChevronLeft className="h-4 w-4" /> {t("back")}
      </Link>
      <h1 className="headline text-[1.5rem] font-bold text-navy-950">{t("waiting")}</h1>
      {nothing && <p className="rounded-xl border border-dashed border-navy-200 bg-white px-4 py-8 text-center text-navy-500">{t("nothingWaiting")}</p>}

      {requests.length > 0 && (
        <section aria-labelledby="disc-h" className="space-y-3">
          <h2 id="disc-h" className="label-sm text-navy-500">
            {t("discountRequests")} · {requests.length}
          </h2>
          {requests.map(({ a, requestedByName, saleNumber }) => {
            const d = (a.details ?? {}) as Details;
            return (
              <article key={a.id} className="rounded-xl border border-navy-200 bg-white p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={`/dashboard/sales/${a.saleId}`} className="font-bold text-navy-950 tabular underline-offset-[3px] hover:underline">
                    {saleNumber}
                  </Link>
                  <span className="text-lg font-bold text-navy-950 tabular">{formatINR(d.grandTotal ?? "0")}</span>
                </div>
                <div className="mt-1 text-[15px] text-navy-800">
                  <b className="tabular">{Number(d.maxDiscountPercent ?? 0)}%</b> {t("discount")}
                  {d.listTotal && <span className="text-navy-500"> · {formatINR(d.listTotal)} → {formatINR(d.grandTotal ?? "0")}</span>}
                </div>
                <dl className="mt-2 space-y-0.5 text-sm">
                  <div>
                    <dt className="inline text-navy-500">{t("askedBy")}: </dt>
                    <dd className="inline font-semibold text-navy-900">{requestedByName}</dd>
                  </div>
                  <div>
                    <dt className="inline text-navy-500">{t("reason")}: </dt>
                    <dd className="inline text-navy-900">{a.reason}</dd>
                  </div>
                </dl>
                {!!d.lines?.length && (
                  <ul className="mt-2 space-y-0.5 border-t border-navy-100 pt-2 text-[13px] text-navy-600">
                    {d.lines.slice(0, 4).map((l, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="truncate">
                          {l.name} × {Number(l.quantity)}
                        </span>
                        <span className="shrink-0 tabular">{Number(l.discountPercent) > 0 ? `−${Number(l.discountPercent)}%` : ""}</span>
                      </li>
                    ))}
                    {d.lines.length > 4 && <li className="text-navy-400">+{d.lines.length - 4}</li>}
                  </ul>
                )}
                <ApprovalActions id={a.id} labels={labels} />
              </article>
            );
          })}
        </section>
      )}

      {waiting.prices > 0 && (
        <LinkCard href="/dashboard/approvals" title={`${t("priceChanges")} · ${waiting.prices}`} hint={t("priceChangesHint")} action={t("openPriceChanges")} />
      )}
      {waiting.orders > 0 && <LinkCard href="/dashboard/orders" title={`${t("newOrders")} · ${waiting.orders}`} action={t("openOrders")} />}
    </div>
  );
}

function LinkCard({ href, title, hint, action }: { href: string; title: string; hint?: string; action: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 rounded-xl border border-navy-200 bg-white p-4">
      <span className="min-w-0">
        <span className="block font-bold text-navy-950">{title}</span>
        {hint && <span className="mt-0.5 block text-sm text-navy-600">{hint}</span>}
        <span className="mt-1 block text-sm font-semibold text-navy-700 underline underline-offset-[3px]">{action}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-navy-400" />
    </Link>
  );
}
