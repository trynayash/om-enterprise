import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { withParams, type SearchParams } from "./params";

export function Pagination({ total, page, pageSize, sp, basePath }: { total: number; page: number; pageSize: number; sp: SearchParams; basePath: string }) {
  // An empty list already shows its own empty state; a "no results" line under it is just noise.
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav className="no-print mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
      <span className="font-mono text-xs tabular text-navy-500">
        {first.toLocaleString("en-IN")}–{last.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link className={buttonClass("outline", "sm")} href={`${basePath}${withParams(sp, { page: page - 1 })}`}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Link>
          ) : (
            <span className={buttonClass("outline", "sm", "pointer-events-none opacity-40")} aria-disabled>
              <ChevronLeft className="h-4 w-4" /> Previous
            </span>
          )}
          <span className="px-1 font-mono text-xs tabular text-navy-500">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Link className={buttonClass("outline", "sm")} href={`${basePath}${withParams(sp, { page: page + 1 })}`}>
              Next <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className={buttonClass("outline", "sm", "pointer-events-none opacity-40")} aria-disabled>
              Next <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </div>
      )}
    </nav>
  );
}
