"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, KeyRound, LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

export function PosUserMenu({ name, role, canDashboard }: { name: string; role: string; canDashboard: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-white/10" aria-expanded={open}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-500 text-sm font-bold text-navy-950">{name.slice(0, 1).toUpperCase()}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-semibold">{name}</span>
          <span className="block text-[11px] text-navy-300">{role}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-navy-300" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 animate-fade-in overflow-hidden rounded-xl border border-navy-100 bg-white text-navy-900 shadow-lift" onMouseLeave={() => setOpen(false)}>
          {canDashboard && (
            <Link href="/dashboard" className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-navy-50">
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </Link>
          )}
          <Link href="/account/password" className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-navy-50">
            <KeyRound className="h-4 w-4" /> Change password
          </Link>
          <Link href="/account/security" className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-navy-50">
            <ShieldCheck className="h-4 w-4" /> Secret key
          </Link>
          <button
            type="button"
            onClick={async () => {
              await apiFetch("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
              // Full reload on sign-out so no client-side state from the session survives.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.href = "/login";
            }}
            className="flex w-full items-center gap-2 border-t border-navy-100 px-4 py-2.5 text-left text-sm hover:bg-navy-50"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
