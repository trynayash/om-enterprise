"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { categoryTree, type CategoryOption, type Option } from "./types";

const STATUSES = [
  { value: "all", label: "All products" },
  { value: "published", label: "Published on website" },
  { value: "unpublished", label: "Not published" },
  { value: "needs_review", label: "Needs review" },
  { value: "inactive", label: "Inactive" },
  { value: "sample", label: "Sample data" },
];

export function ProductFilters({ categories, brands }: { categories: CategoryOption[]; brands: Option[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const apply = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v && v !== "all") next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    start(() => router.push(`/dashboard/products${next.size ? `?${next}` : ""}`));
  };

  const hasFilters = ["q", "categoryId", "brandId", "status"].some((k) => params.get(k));
  const narrowing = ["categoryId", "brandId", "status"].filter((k) => params.get(k) && params.get(k) !== "all").length;
  // On a phone the three lists stay folded until "Filters" is tapped, so products show first.
  const [open, setOpen] = useState(false);
  const folded = !open && "max-sm:hidden";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply({ q: q.trim() });
      }}
      className="mb-5 grid gap-2.5 rounded-xl border border-navy-100 bg-white p-3 shadow-card sm:grid-cols-2 lg:grid-cols-[minmax(220px,2fr)_1fr_1fr_1fr_auto]"
      aria-busy={pending}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, model, SKU or barcode"
          className="pl-9"
          aria-label="Search products"
        />
      </div>
      <Select className={cn(folded)} aria-label="Category" value={params.get("categoryId") ?? ""} onChange={(e) => apply({ categoryId: e.target.value })}>
        <option value="">All categories</option>
        {categoryTree(categories).map((c) => (
          <option key={c.id} value={c.id}>
            {"  ".repeat(c.depth)}
            {c.depth ? "↳ " : ""}
            {c.name}
          </option>
        ))}
      </Select>
      <Select className={cn(folded)} aria-label="Brand" value={params.get("brandId") ?? ""} onChange={(e) => apply({ brandId: e.target.value })}>
        <option value="">All brands</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
      <Select className={cn(folded)} aria-label="Status" value={params.get("status") ?? "all"} onChange={(e) => apply({ status: e.target.value })}>
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>
      <div className="flex gap-2">
        <Button variant="outline" className="sm:hidden" aria-expanded={open} icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setOpen((o) => !o)}>
          {open ? "Fewer filters" : narrowing ? `Filters (${narrowing})` : "Filters"}
        </Button>
        {hasFilters && (
          <Button
            variant="ghost"
            icon={<X className="h-4 w-4" />}
            onClick={() => {
              setQ("");
              start(() => router.push("/dashboard/products"));
            }}
          >
            Clear
          </Button>
        )}
        <Button type="submit" loading={pending} className="flex-1 sm:flex-none">
          Search
        </Button>
      </div>
    </form>
  );
}
