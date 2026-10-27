import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { ownerLang } from "@/server/owner-lang";
import { ownerSearch } from "@/server/services/owner";
import { requireOwner } from "../guard";
import type { OwnerKey } from "@/lib/owner-i18n";

export const metadata = { title: "Find" };

export default function FindPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-navy-100/60" />}>
      <Find searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Find({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireOwner();
  const { t } = await ownerLang();
  const raw = (await searchParams).q;
  const q = (typeof raw === "string" ? raw : "").trim();
  const hits = q ? await ownerSearch(actor, q) : [];

  return (
    <div className="space-y-5">
      <Link href="/admin/app" className="inline-flex items-center gap-1 text-sm font-semibold text-navy-600">
        <ChevronLeft className="h-4 w-4" /> {t("back")}
      </Link>
      <form action="/admin/app/find" className="flex gap-2">
        <input
          name="q"
          type="search"
          enterKeyHint="search"
          defaultValue={q}
          placeholder={t("searchPlaceholder")}
          aria-label={t("search")}
          autoFocus={!q}
          className="h-12 min-w-0 flex-1 rounded-lg border border-navy-200 bg-white px-3.5 text-base text-navy-950 placeholder:text-navy-400 focus:border-navy-500 focus:outline-none"
        />
        <button type="submit" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-white" aria-label={t("search")}>
          <Search className="h-5 w-5" />
        </button>
      </form>
      {q &&
        (hits.length ? (
          <ul className="divide-y divide-navy-100 rounded-xl border border-navy-200 bg-white" aria-label={t("results")}>
            {hits.map((h) => (
              <li key={`${h.kind}-${h.id}`}>
                <Link href={h.href} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="label-sm block text-navy-400">{t(`kind.${h.kind}` as OwnerKey)}</span>
                    <span className="block truncate font-semibold text-navy-950">{h.title}</span>
                    {h.detail && <span className="block truncate text-[13px] text-navy-500">{h.detail}</span>}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-navy-400" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-navy-200 bg-white px-4 py-6 text-center text-sm text-navy-500">{t("noResults")}</p>
        ))}
    </div>
  );
}
