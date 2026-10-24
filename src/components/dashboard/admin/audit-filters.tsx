"use client";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";

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
      className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-navy-100 bg-white px-4 pb-4 pt-3.5 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        apply({ q });
      }}
    >
      <div className="min-w-60 flex-[2]">
        <Label htmlFor="audit-q">Search</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
          <Input id="audit-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search summary, person or record id" className="pl-9" aria-label="Search audit log" />
        </div>
      </div>
      <div className="min-w-52 flex-1">
        <Label htmlFor="audit-action">Action</Label>
        <Select id="audit-action" value={params.get("action") ?? ""} onChange={(e) => apply({ action: e.target.value })} aria-label="Action type">
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-[152px]">
        <Label htmlFor="audit-from">From</Label>
        <Input id="audit-from" type="date" defaultValue={params.get("from") ?? ""} onChange={(e) => apply({ from: e.target.value })} className="font-mono text-[13px]" aria-label="From date" />
      </div>
      <div className="w-[152px]">
        <Label htmlFor="audit-to">To</Label>
        <Input id="audit-to" type="date" defaultValue={params.get("to") ?? ""} onChange={(e) => apply({ to: e.target.value })} className="font-mono text-[13px]" aria-label="To date" />
      </div>
      <Button type="submit" variant="outline" icon={<Search className="h-4 w-4" />}>
        Search
      </Button>
    </form>
  );
}
