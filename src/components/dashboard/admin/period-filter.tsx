"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Label, Select } from "@/components/ui/field";

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

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "fy", label: "This financial year" },
] as const;

/** The preset whose range is exactly from–to (the default range is "Last 30 days"), or "custom". */
function matchingPreset(from: string, to: string) {
  return PRESETS.find((p) => {
    const r = presetRange(p.key);
    return r.from === from && r.to === to;
  })?.key ?? "custom";
}

/** One row of filters above everything it scopes (date range first). */
export function PeriodFilter({ from, to }: { from: string; to: string }) {
  const preset = matchingPreset(from, to);
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
      <div className="w-full sm:w-48">
        <Label htmlFor="preset">Period</Label>
        {/* Shows the preset the dates match (the default is the last 30 days), or "Custom range" after picking dates. */}
        <Select
          id="preset"
          value={preset}
          onChange={(e) => {
            if (e.target.value === "custom") return;
            const r = presetRange(e.target.value);
            go(r.from, r.to);
          }}
        >
          {PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
          {preset === "custom" && <option value="custom">Custom range</option>}
        </Select>
      </div>
      <div className="w-[calc(50%-0.375rem)] sm:w-[152px]">
        <Label htmlFor="from">From</Label>
        <Input id="from" type="date" value={from} max={to} onChange={(e) => e.target.value && go(e.target.value, to)} className="font-mono text-[13px]" />
      </div>
      <div className="w-[calc(50%-0.375rem)] sm:w-[152px]">
        <Label htmlFor="to">To</Label>
        <Input id="to" type="date" value={to} min={from} onChange={(e) => e.target.value && go(from, e.target.value)} className="font-mono text-[13px]" />
      </div>
    </div>
  );
}
