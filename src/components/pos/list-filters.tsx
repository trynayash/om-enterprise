"use client";
import { useId, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { cn } from "@/components/ui/cn";

export interface FilterSelect {
  name: string;
  label: string;
  options: { value: string; label: string }[];
}

/**
 * Search box + selects + date range that write to the URL query (server re-renders the list). On a
 * phone the selects and dates stay folded until "Filters" is tapped.
 */
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
  const narrowing = Object.entries(initial).filter(([k, v]) => k !== "q" && v).length;
  const [open, setOpen] = useState(false);
  const folded = !open && "max-sm:hidden";
  const apply = (e?: React.FormEvent) => {
    e?.preventDefault();
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(values)) if (v) qs.set(k, v);
    router.push(`${pathname}${qs.size ? `?${qs}` : ""}`);
  };
  return (
    <form onSubmit={apply} className="flex flex-wrap items-end gap-2 rounded-xl border border-navy-200 bg-white p-3 shadow-card">
      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
        <Input value={values.q ?? ""} onChange={(e) => set("q", e.target.value)} placeholder={placeholder} className="h-11 pl-9" aria-label="Search" />
      </div>
      {selects.map((s) => (
        <label key={s.name} className={cn("w-[calc(50%-0.25rem)] sm:w-auto", folded)}>
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
        // Inputs are always w-full, so the wrappers set the width. "From" / "To" sit inside the field,
        // like a unit on a spec sheet, so the row keeps one height.
        <>
          <DateField label="From" value={values.from ?? ""} onChange={(v) => set("from", v)} max={values.to || undefined} className={cn(folded)} />
          <DateField label="To" value={values.to ?? ""} onChange={(v) => set("to", v)} min={values.from || undefined} className={cn(folded)} />
        </>
      )}
      {(selects.length > 0 || dates) && (
        <Button variant="outline" size="lg" className="h-11 sm:hidden" aria-expanded={open} icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setOpen((o) => !o)}>
          {open ? "Fewer filters" : narrowing ? `Filters (${narrowing})` : "Filters"}
        </Button>
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

function DateField({ label, value, onChange, min, max, className }: { label: "From" | "To"; value: string; onChange: (v: string) => void; min?: string; max?: string; className?: string }) {
  const id = useId();
  return (
    <div className={cn("relative w-[calc(50%-0.25rem)] sm:w-44", className)}>
      <label htmlFor={id} className="label-caps pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-500">
        {label}
      </label>
      <Input id={id} type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} className={label === "From" ? "h-11 pl-14" : "h-11 pl-10"} aria-label={`${label} date`} />
    </div>
  );
}
