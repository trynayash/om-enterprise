"use client";
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/25 px-4 text-sm font-semibold text-white hover:bg-white/10"
    >
      <Printer className="h-4 w-4" /> Print
    </button>
  );
}
