import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type SP = Record<string, string | string[] | undefined>;

export function str(sp: SP, key: string): string {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/** IST calendar-day bounds for ?from= / ?to= (YYYY-MM-DD). */
export function istRange(sp: SP): { from?: Date; to?: Date } {
  const f = str(sp, "from");
  const t = str(sp, "to");
  const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  return {
    from: ok(f) ? new Date(`${f}T00:00:00+05:30`) : undefined,
    to: ok(t) ? new Date(`${t}T23:59:59.999+05:30`) : undefined,
  };
}

export function Pager({ path, sp, page, pageSize, total }: { path: string; sp: SP; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="label-mono text-center text-navy-400">{total} record{total === 1 ? "" : "s"}</p>;
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v && k !== "page") qs.set(k, v);
    qs.set("page", String(p));
    return `${path}?${qs}`;
  };
  return (
    <nav className="flex items-center justify-center gap-3 text-sm" aria-label="Pagination">
      {page > 1 ? (
        <Link href={href(page - 1)} className="inline-flex h-10 items-center gap-1 rounded-lg border border-navy-200 bg-white px-3 font-semibold text-navy-800 transition-colors hover:border-navy-900">
          <ChevronLeft className="h-4 w-4" /> Previous
        </Link>
      ) : (
        <span className="inline-flex h-10 items-center px-3 text-navy-300">Previous</span>
      )}
      <span className="font-mono text-xs text-navy-500 tabular">
        Page {page} of {pages} · {total} records
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className="inline-flex h-10 items-center gap-1 rounded-lg border border-navy-200 bg-white px-3 font-semibold text-navy-800 transition-colors hover:border-navy-900">
          Next <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span className="inline-flex h-10 items-center px-3 text-navy-300">Next</span>
      )}
    </nav>
  );
}
