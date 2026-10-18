"use client";
import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Search, X } from "lucide-react";
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
 * Empty fields are dropped; changing filters resets to page 1.
 */
export function FilterBar({ fields, values, className }: { fields: FilterField[]; values: Record<string, string | undefined>; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const active = fields.some((f) => values[f.name]);

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

  return (
    <form
      className={cn("no-print mb-4 rounded-2xl border border-navy-100 bg-white p-3 shadow-card", className)}
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
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
                  <Input id={id} name={f.name} defaultValue={values[f.name] ?? ""} placeholder={f.placeholder} className="pl-9" type="search" />
                </div>
              </div>
            );
          }
          if (f.kind === "select") {
            return (
              <div key={f.name} className="min-w-[150px] flex-1">
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
              <div key={f.name} className="w-[150px]">
                <Label htmlFor={id}>{f.label}</Label>
                <Input id={id} name={f.name} type="date" defaultValue={values[f.name] ?? ""} />
              </div>
            );
          }
          return (
            <div key={f.name} className="flex h-10 items-center">
              <Checkbox name={f.name} label={f.label} defaultChecked={values[f.name] === "1"} onChange={(e) => submit(e.currentTarget.form!)} />
            </div>
          );
        })}
        <div className="flex gap-2">
          <Button type="submit" loading={pending} icon={<Search className="h-4 w-4" />}>
            Apply
          </Button>
          {active && (
            <Button
              variant="ghost"
              icon={<X className="h-4 w-4" />}
              onClick={() => start(() => router.push(values.view ? `${pathname}?view=${values.view}` : pathname))}
            >
              Clear
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
