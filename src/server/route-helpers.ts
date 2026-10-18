import "server-only";
import { istStartOfDay } from "@/lib/india";

/** Parse ?from=YYYY-MM-DD&to=YYYY-MM-DD as IST calendar days (to is inclusive). */
export function periodFromQuery(q: URLSearchParams, defaultDays = 30): { from: Date; to: Date } {
  const parseDay = (s: string | null) => {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d) - 5.5 * 3600_000);
  };
  const today = istStartOfDay(new Date());
  const to = parseDay(q.get("to"));
  const from = parseDay(q.get("from"));
  return {
    from: from ?? new Date(today.getTime() - (defaultDays - 1) * 86400_000),
    to: new Date((to ?? today).getTime() + 86400_000),
  };
}

export function intParam(q: URLSearchParams, key: string, fallback: number) {
  const v = Number(q.get(key));
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

export function optionalDate(q: URLSearchParams, key: string): Date | undefined {
  const s = q.get(key);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
