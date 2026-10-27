import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { can } from "@/server/auth/actor";
import { ownerLang } from "@/server/owner-lang";
import { billsOn, ownerDay } from "@/server/services/owner";
import { requireOwner } from "../guard";
import { formatINR } from "@/lib/money";
import { METHOD_NAMES } from "@/lib/owner-i18n";
import { cn } from "@/components/ui/cn";

export const metadata = { title: "Today's money" };

export default function TodayPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-navy-100/60" />}>
      <Today searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Today({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireOwner();
  if (!can(actor, "reports.view")) redirect("/admin/app");
  const { lang, t } = await ownerLang();
  const yesterday = (await searchParams).day === "yesterday";
  const now = new Date();
  const date = yesterday ? new Date(now.getTime() - 86400_000) : now;
  const [day, bills] = await Promise.all([ownerDay(actor, date), billsOn(actor, date)]);
  const rows: [string, string, boolean?][] = [
    [t("bills"), String(day.bills)],
    [t("billed"), formatINR(day.billed)],
    [t("discounts"), formatINR(day.discounts)],
    ...(Number(day.refunded) > 0 ? [[t("refunded"), formatINR(day.refunded)] as [string, string]] : []),
    ...(day.cancelledBills ? [[t("cancelledBills"), String(day.cancelledBills)] as [string, string]] : []),
    ...(day.unpaid.count ? [[t("unpaid"), `${day.unpaid.count} · ${formatINR(day.unpaid.amount)} ${t("due")}`, true] as [string, string, boolean]] : []),
  ];
  const time = (d: Date) => d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/admin/app" className="inline-flex items-center gap-1 text-sm font-semibold text-navy-600">
          <ChevronLeft className="h-4 w-4" /> {t("back")}
        </Link>
        <div className="flex rounded-lg border border-navy-200 bg-white p-0.5 text-sm">
          <Link href="/admin/app/today" className={cn("rounded-md px-3 py-1.5 font-semibold", !yesterday ? "bg-navy-900 text-white" : "text-navy-600")}>
            {t("today")}
          </Link>
          <Link href="/admin/app/today?day=yesterday" className={cn("rounded-md px-3 py-1.5 font-semibold", yesterday ? "bg-navy-900 text-white" : "text-navy-600")}>
            {t("yesterday")}
          </Link>
        </div>
      </div>

      <section className="rounded-xl bg-navy-950 p-5 text-white">
        <div className="label-sm text-gold-300">{t("received")}</div>
        <div className="headline mt-1 text-[2.25rem] font-bold tabular">{formatINR(day.received)}</div>
        {day.byMethod.length ? (
          <ul className="mt-3 space-y-1.5 border-t border-white/15 pt-3 text-[15px]">
            {day.byMethod.map((b) => (
              <li key={b.method} className="flex justify-between gap-3">
                <span className="text-white/75">{METHOD_NAMES[lang][b.method] ?? b.method}</span>
                <span className="font-semibold tabular">{formatINR(b.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-white/70">{t("noMoneyYet")}</p>
        )}
      </section>

      <section className="rounded-xl border border-navy-200 bg-white">
        <ul className="divide-y divide-navy-100">
          {rows.map(([k, v, warn]) => (
            <li key={k} className="flex justify-between gap-3 px-4 py-3 text-[15px]">
              <span className="text-navy-600">{k}</span>
              <span className={cn("font-semibold tabular", warn ? "text-amber-800" : "text-navy-950")}>{v}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="bills-h">
        <h2 id="bills-h" className="label-sm mb-2 text-navy-500">
          {t("recentBills")}
        </h2>
        {bills.length ? (
          <ul className="divide-y divide-navy-100 rounded-xl border border-navy-200 bg-white">
            {bills.map((b) => (
              <li key={b.id}>
                <Link href={`/dashboard/documents/${b.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block font-semibold text-navy-950 tabular">{b.number}</span>
                    <span className="block truncate text-[13px] text-navy-500">
                      {time(b.issuedAt)}
                      {b.buyer ? ` · ${b.buyer}` : ""}
                    </span>
                  </span>
                  <span className={cn("shrink-0 font-semibold tabular", b.status === "cancelled" ? "text-navy-400 line-through" : "text-navy-950")}>{formatINR(b.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-navy-200 bg-white px-4 py-6 text-center text-sm text-navy-500">{t("noBillsYet")}</p>
        )}
      </section>

      <Link href="/dashboard/reports" className="block text-center text-sm font-semibold text-navy-600 underline underline-offset-[3px]">
        {t("seeReports")}
      </Link>
    </div>
  );
}
