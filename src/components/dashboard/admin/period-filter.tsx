"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "@/components/ui/field";

function istToday() {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}
function shift(day: string, days: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function presetRange(preset: string): { from: string; to: string } {
  const today = istToday();
  const [y, m] = today.split("-").map(Number);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: shift(today, -6), to: today };
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "last-month": {
      const first = new Date(Date.UTC(y, m - 2, 1));
      const last = new Date(Date.UTC(y, m - 1, 0));
      return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
    }
    case "fy": {
      const startYear = m >= 4 ? y : y - 1;
      return { from: `${startYear}-04-01`, to: today };
    }
    default:
      return { from: shift(today, -29), to: today };
  }
}

/** One row of filters above everything it scopes (date range first). */
export function PeriodFilter({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (f: string, t: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("from", f);
    p.set("to", t);
    router.push(`${pathname}?${p.toString()}`);
  };
  return (
    <div className="no-print mb-5 flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-navy-700" htmlFor="preset">
          Period
        </label>
        <Select
          id="preset"
          className="w-44"
          defaultValue=""
          onChange={(e) => {
            if (!e.target.value) return;
            const r = presetRange(e.target.value);
            go(r.from, r.to);
          }}
        >
          <option value="">Choose…</option>
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="month">This month</option>
          <option value="last-month">Last month</option>
          <option value="fy">This financial year</option>
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-navy-700" htmlFor="from">
          From
        </label>
        <Input id="from" type="date" value={from} max={to} onChange={(e) => e.target.value && go(e.target.value, to)} className="w-40" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-navy-700" htmlFor="to">
          To
        </label>
        <Input id="to" type="date" value={to} min={from} onChange={(e) => e.target.value && go(from, e.target.value)} className="w-40" />
      </div>
    </div>
  );
}
