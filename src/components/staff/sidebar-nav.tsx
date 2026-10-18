"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, X, KeyRound } from "lucide-react";
import type { NavGroup } from "@/lib/nav";
import { Logo, LogoMark } from "@/components/ui/logo";
import { cn } from "@/components/ui/cn";
import { NavIcon } from "./nav-icon";
import { apiFetch } from "@/lib/api-client";

export function SidebarNav({ groups, user, badges }: { groups: NavGroup[]; user: { name: string; role: string }; badges?: Record<string, number> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  const logout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
    // Full page load on sign-out so no client-side state of the previous user survives.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  };

  const content = (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5">
        <Link href="/dashboard" onClick={() => setOpen(false)}>
          <Logo inverted size="sm" />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
        {groups.map((g) => (
          <div key={g.label} className="mb-4">
            <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-navy-300">{g.label}</div>
            {g.items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                onClick={() => setOpen(false)}
                aria-current={isActive(i.href) ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  isActive(i.href) ? "bg-white/10 text-white" : "text-navy-200 hover:bg-white/5 hover:text-white",
                )}
              >
                <NavIcon name={i.icon} className={cn("h-4.5 w-4.5", isActive(i.href) ? "text-gold-400" : "text-navy-300 group-hover:text-gold-400")} />
                <span className="flex-1">{i.label}</span>
                {badges?.[i.href] ? <span className="rounded-full bg-gold-500 px-1.5 text-[10px] font-bold text-navy-950">{badges[i.href]}</span> : null}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="px-3 pb-2">
          <div className="truncate text-sm font-semibold text-white">{user.name}</div>
          <div className="text-xs text-navy-300">{user.role}</div>
        </div>
        <Link href="/account/password" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-navy-200 hover:bg-white/5 hover:text-white">
          <KeyRound className="h-4 w-4" /> Change password
        </Link>
        <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-navy-200 hover:bg-white/5 hover:text-white">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-navy-800 bg-navy-900 px-4 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <LogoMark className="h-8 w-8" />
          <span className="text-sm font-extrabold tracking-[0.12em] text-white">OM ENTERPRISE</span>
        </Link>
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-white hover:bg-white/10" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
      </div>
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 bg-navy-900 lg:block">{content}</aside>
      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-navy-950/60" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-fade-in bg-navy-900 shadow-lift">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-lg p-1.5 text-white hover:bg-white/10" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
