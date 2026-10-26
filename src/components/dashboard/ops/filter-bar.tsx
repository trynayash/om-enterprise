"use client";
import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Label, Select } from "@/components/ui/field";
import { cn } from "@/components/ui/cn";

export type FilterField =
  | { kind: "search"; name: string; placeholder: string; label?: string }
  | { kind: "select"; name: string; label: string; options: { value: string; label: string }[] }
  | { kind: "date"; name: string; label: string }
  | { kind: "toggle"; name: string; label: string };

/**
 * Filter form synced to the URL (so filters are shareable and the server renders the list).
 * Empty fields are dropped; changing filters resets to page 1. On a phone only the search box shows
 * until "Filters" is tapped, so the list itself is on the first screen.
 */
export function FilterBar({ fields, values, className }: { fields: FilterField[]; values: Record<string, string | undefined>; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const active = fields.some((f) => values[f.name]);
  const narrowing = fields.filter((f) => f.kind !== "search" && values[f.name]).length;
  const [open, setOpen] = useState(false);
  const folded = !open && "max-sm:hidden";

  const submit = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const q = new URLSearchParams();
    for (const f of fields) {
      const v = data.get(f.name);
      if (f.kind === "toggle") {
        if (v) q.set(f.name, "1");
      } else if (typeof v === "string" && v.trim()) q.set(f.name, v.trim());
    }
    // keep a "view" param if present in the path's current state
    if (values.view) q.set("view", values.view);
    start(() => router.push(`${pathname}${q.toString() ? `?${q}` : ""}`));
  };

  const toggles = fields.filter((f) => f.kind === "toggle");
  return (
    <form
      className={cn("no-print mb-5 rounded-xl border border-navy-100 bg-white px-4 pb-4 pt-3.5 shadow-card", className)}
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      role="search"
    >
      <div className="flex flex-wrap items-end gap-3">
        {fields.map((f) => {
          const id = `f-${f.name}`;
          if (f.kind === "search") {
            return (
              <div key={f.name} className="min-w-[220px] flex-[2]">
                <Label htmlFor={id}>{f.label ?? "Search"}</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
                  <Input id={id} name={f.name} defaultValue={values[f.name] ?? ""} placeholder={f.placeholder} className="pl-9" type="search" />
                </div>
              </div>
            );
          }
          if (f.kind === "select") {
            return (
              <div key={f.name} className={cn("min-w-[140px] flex-1", folded)}>
                <Label htmlFor={id}>{f.label}</Label>
                <Select
                  id={id}
                  name={f.name}
                  defaultValue={values[f.name] ?? ""}
                  onChange={(e) => submit(e.currentTarget.form!)}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            );
          }
          if (f.kind === "date") {
            return (
              <div key={f.name} className={cn("w-[148px] max-sm:min-w-[130px] max-sm:flex-1", folded)}>
                <Label htmlFor={id}>{f.label}</Label>
                <Input id={id} name={f.name} type="date" defaultValue={values[f.name] ?? ""} className="tabular text-[13px]" />
              </div>
            );
          }
          return null;
        })}
        {/* Toggles and the actions sit together at the end of the row (and on the right when it wraps). */}
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          {toggles.map((f) => (
            <div key={f.name} className={cn("flex h-10 items-center", folded)}>
              <Checkbox name={f.name} label={f.label} defaultChecked={values[f.name] === "1"} onChange={(e) => submit(e.currentTarget.form!)} />
            </div>
          ))}
          <div className="flex gap-2">
            {fields.some((f) => f.kind !== "search") && (
              <Button variant="outline" className="sm:hidden" aria-expanded={open} icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setOpen((o) => !o)}>
                {open ? "Fewer filters" : narrowing ? `Filters (${narrowing})` : "Filters"}
              </Button>
            )}
            {active && (
              <Button
                variant="ghost"
                icon={<X className="h-4 w-4" />}
                onClick={() => start(() => router.push(values.view ? `${pathname}?view=${values.view}` : pathname))}
              >
                Clear
              </Button>
            )}
            <Button type="submit" loading={pending} icon={<Search className="h-4 w-4" />}>
              Apply
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
