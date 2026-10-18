"use client";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

const ACTIONS = [
  { value: "", label: "All actions" },
  { value: "auth.", label: "Sign-ins & passwords" },
  { value: "user.", label: "Staff accounts & permissions" },
  { value: "role.", label: "Role changes" },
  { value: "price.", label: "Price changes" },
  { value: "cost.", label: "Cost changes" },
  { value: "discount.", label: "Discount approvals" },
  { value: "payment.", label: "Payments" },
  { value: "document.", label: "Bills & documents" },
  { value: "sale.", label: "Sales" },
  { value: "product.", label: "Products" },
  { value: "settings.", label: "Settings" },
  { value: "website_order.", label: "Website orders" },
  { value: "stock.", label: "Stock" },
];

export function AuditFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const apply = (patch: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("page");
    router.push(`${pathname}?${p.toString()}`);
  };
  return (
    <form
      className="mb-4 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        apply({ q });
      }}
    >
      <div className="relative min-w-60 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search summary, person or record id" className="pl-9" aria-label="Search audit log" />
      </div>
      <Select value={params.get("action") ?? ""} onChange={(e) => apply({ action: e.target.value })} className="w-56" aria-label="Action type">
        {ACTIONS.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </Select>
      <Input type="date" defaultValue={params.get("from") ?? ""} onChange={(e) => apply({ from: e.target.value })} className="w-40" aria-label="From date" />
      <Input type="date" defaultValue={params.get("to") ?? ""} onChange={(e) => apply({ to: e.target.value })} className="w-40" aria-label="To date" />
      <Button type="submit" variant="outline">
        Search
      </Button>
    </form>
  );
}
