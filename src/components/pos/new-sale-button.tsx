"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/button";

/** Big "NEW SALE" tile / button: creates a draft sale and opens it. */
export function NewSaleButton({ variant = "tile", className }: { variant?: "tile" | "button"; className?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const sale = await apiFetch<{ id: string }>("/api/sales", { method: "POST", body: {} });
      router.push(`/pos/sale/${sale.id}`);
    } catch (err) {
      toast(errorMessage(err), "error");
      setBusy(false);
    }
  };
  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-lg bg-gold-500 px-4 text-sm font-bold text-navy-950 shadow-sm hover:bg-gold-400 disabled:opacity-60",
          className,
        )}
      >
        {busy ? <Spinner /> : <Plus className="h-4 w-4" />} New sale
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={start}
      disabled={busy}
      data-testid="new-sale"
      className={cn(
        "group relative flex min-h-48 flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-gold-400 via-gold-500 to-gold-600 p-6 text-left text-navy-950 shadow-lift transition-transform hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-gold-300 disabled:opacity-70",
        className,
      )}
    >
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/20" />
      <span aria-hidden className="pointer-events-none absolute -bottom-16 right-16 h-40 w-40 rounded-full bg-navy-900/5" />
      <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-900 text-gold-400 shadow-md">
        {busy ? <Spinner className="h-6 w-6" /> : <Plus className="h-8 w-8" strokeWidth={2.5} />}
      </span>
      <span className="relative">
        <span className="block text-3xl font-extrabold tracking-tight sm:text-4xl">NEW SALE</span>
        <span className="mt-1 block text-sm font-semibold text-navy-900/75">Start billing a customer — prices &amp; totals are automatic</span>
      </span>
    </button>
  );
}
