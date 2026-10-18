"use client";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

export interface FilterSelect {
  name: string;
  label: string;
  options: { value: string; label: string }[];
}

/** Search box + selects + date range that write to the URL query (server re-renders the list). */
export function ListFilters({
  initial,
  placeholder,
  selects = [],
  dates = true,
}: {
  initial: Record<string, string>;
  placeholder: string;
  selects?: FilterSelect[];
  dates?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [values, setValues] = useState<Record<string, string>>(initial);
  const set = (k: string, v: string) => setValues((x) => ({ ...x, [k]: v }));
  const apply = (e?: React.FormEvent) => {
    e?.preventDefault();
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(values)) if (v) qs.set(k, v);
    router.push(`${pathname}${qs.size ? `?${qs}` : ""}`);
  };
  return (
    <form onSubmit={apply} className="flex flex-wrap items-end gap-2 rounded-2xl border border-navy-100 bg-white p-3 shadow-card">
      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
        <Input value={values.q ?? ""} onChange={(e) => set("q", e.target.value)} placeholder={placeholder} className="h-11 pl-9" aria-label="Search" />
      </div>
      {selects.map((s) => (
        <label key={s.name} className="w-[calc(50%-0.25rem)] text-xs font-semibold text-navy-600 sm:w-auto">
          <span className="sr-only">{s.label}</span>
          <Select value={values[s.name] ?? ""} onChange={(e) => set(s.name, e.target.value)} className="h-11 min-w-36" aria-label={s.label}>
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
      ))}
      {dates && (
        // Inputs are always w-full, so the wrappers set the width.
        <>
          <div className="w-[calc(50%-0.25rem)] sm:w-40">
            <Input type="date" value={values.from ?? ""} onChange={(e) => set("from", e.target.value)} className="h-11" aria-label="From date" />
          </div>
          <div className="w-[calc(50%-0.25rem)] sm:w-40">
            <Input type="date" value={values.to ?? ""} onChange={(e) => set("to", e.target.value)} className="h-11" aria-label="To date" />
          </div>
        </>
      )}
      <Button type="submit" size="lg" className="h-11">
        Search
      </Button>
      {Object.values(values).some(Boolean) && (
        <Button
          variant="ghost"
          className="h-11"
          onClick={() => {
            setValues({});
            router.push(pathname);
          }}
        >
          Clear
        </Button>
      )}
    </form>
  );
}
