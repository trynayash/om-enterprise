"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, KeyRound, LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/components/ui/cn";

const item = "flex items-center gap-2.5 px-4 py-2.5 text-sm text-navy-800 transition-colors hover:bg-paper";

export function PosUserMenu({ name, role, canDashboard }: { name: string; role: string; canDashboard: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on a tap/click outside or Esc (touch screens have no mouse-leave).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-lg py-1.5 pl-1.5 pr-2 transition-colors hover:bg-white/[0.07]"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-navy-800 font-mono text-sm font-semibold text-gold-400 ring-1 ring-inset ring-white/10">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden text-left leading-tight xl:block">
          <span className="block text-[13px] font-semibold">{name}</span>
          <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.08em] text-navy-400">{role}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-navy-400 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-60 animate-sheet-in overflow-hidden rounded-lg border border-navy-100 bg-white py-1 text-navy-900 shadow-lift" onMouseLeave={() => setOpen(false)}>
          <div className="border-b border-navy-100 px-4 pb-2.5 pt-2 xl:hidden">
            <div className="text-sm font-semibold">{name}</div>
            <div className="label-caps mt-0.5 text-navy-500">{role}</div>
          </div>
          {canDashboard && (
            <Link href="/dashboard" className={item}>
              <LayoutDashboard className="h-4 w-4 text-navy-400" /> Dashboard
            </Link>
          )}
          <Link href="/account/password" className={item}>
            <KeyRound className="h-4 w-4 text-navy-400" /> Change password
          </Link>
          <Link href="/account/security" className={item}>
            <ShieldCheck className="h-4 w-4 text-navy-400" /> Secret key
          </Link>
          <button
            type="button"
            onClick={async () => {
              await apiFetch("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
              // Full reload on sign-out so no client-side state from the session survives.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.href = "/login";
            }}
            className={cn(item, "mt-1 w-full border-t border-navy-100 pt-3 text-left")}
          >
            <LogOut className="h-4 w-4 text-navy-400" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
