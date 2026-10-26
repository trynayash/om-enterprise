"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { Spinner, buttonClass } from "@/components/ui/button";

/** The "New sale" key / button: creates a draft sale and opens it. */
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
      <button type="button" onClick={start} disabled={busy} className={buttonClass("gold", "md", className)}>
        {busy ? <Spinner /> : <Plus className="h-4 w-4" strokeWidth={2.5} />} New sale
      </button>
    );
  }
  // The counter's one big key: flat brass, a plain title and one line under it.
  return (
    <button
      type="button"
      onClick={start}
      disabled={busy}
      data-testid="new-sale"
      className={cn(
        "group flex min-h-40 flex-col justify-between gap-6 rounded-xl bg-gold-500 p-5 text-left text-navy-950 shadow-[inset_0_-2px_0_rgb(0_0_0/0.16)] transition-[background-color,transform] duration-150 ease-out hover:bg-gold-400 active:translate-y-px active:bg-gold-600 disabled:opacity-70 sm:p-6",
        className,
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-950 text-gold-400 transition-transform duration-200 ease-out group-hover:scale-[1.04]">
        {busy ? <Spinner className="h-5 w-5" /> : <Plus className="h-5 w-5" strokeWidth={2.25} />}
      </span>
      <span className="block">
        <span className="block text-[2rem] font-semibold leading-tight tracking-[-0.015em]">New sale</span>
        <span className="mt-1.5 block text-sm text-navy-950/75">Start billing a customer — prices &amp; totals are automatic</span>
      </span>
    </button>
  );
}
