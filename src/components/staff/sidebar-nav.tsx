"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, X, KeyRound, ShieldCheck } from "lucide-react";
import type { NavGroup } from "@/lib/nav";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/components/ui/cn";
import { NavIcon } from "./nav-icon";
import { apiFetch } from "@/lib/api-client";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

const footerLink =
  "flex h-7 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-navy-300 transition-colors duration-150 hover:bg-white/[0.05] hover:text-white";

/** A count beside a menu item; `quiet` ones are informational rather than waiting on someone. */
export interface NavBadge {
  count: number;
  quiet?: boolean;
}

export function SidebarNav({ groups, user, badges }: { groups: NavGroup[]; user: { name: string; role: string }; badges?: Record<string, NavBadge> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  const close = () => setOpen(false);
  const logout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
    // Full page load on sign-out so no client-side state of the previous user survives.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  };

  // The phone drawer closes with Escape, like any other overlay.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center border-b border-white/[0.08] px-5">
        <Link href="/dashboard" onClick={close} className="rounded-md">
          <Logo inverted compact size="sm" />
        </Link>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-2.5" aria-label="Main">
        {groups.map((g) => (
          <div key={g.label} className="mt-3 first:mt-0">
            <div className="label-caps px-2.5 pb-1 text-navy-400">{g.label}</div>
            <ul>
              {g.items.map((i) => {
                const active = isActive(i.href);
                const badge = badges?.[i.href];
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-[30px] items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium transition-colors duration-150",
                        active ? "bg-white/[0.07] text-white" : "text-navy-200 hover:bg-white/[0.04] hover:text-white",
                      )}
                    >
                      {active && <span aria-hidden className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-gold-400" />}
                      <NavIcon name={i.icon} className={cn("h-4 w-4 shrink-0 transition-colors duration-150", active ? "text-gold-400" : "text-navy-400 group-hover:text-navy-200")} />
                      <span className="min-w-0 flex-1 truncate">{i.label}</span>
                      {badge?.count ? (
                        <span
                          className={cn(
                            "min-w-5 rounded-[3px] px-1 text-center text-[11px] font-semibold leading-[18px] tabular",
                            badge.quiet ? "text-navy-300" : "bg-gold-500 text-navy-950",
                          )}
                        >
                          {badge.count.toLocaleString("en-IN")}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-white/[0.08] px-3 pb-2.5 pt-3">
        <div className="mb-1.5 flex items-center gap-2.5 px-2.5">
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/[0.07] font-mono text-[11px] font-semibold text-gold-300">
            {initials(user.name)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold leading-tight text-white">{user.name}</div>
            <div className="label-caps mt-0.5 truncate text-navy-400">{user.role}</div>
          </div>
        </div>
        <Link href="/account/password" onClick={close} className={footerLink}>
          <KeyRound className="h-4 w-4 shrink-0 text-navy-400" /> Change password
        </Link>
        <Link href="/account/security" onClick={close} className={footerLink}>
          <ShieldCheck className="h-4 w-4 shrink-0 text-navy-400" /> Secret key
        </Link>
        <button type="button" onClick={logout} className={footerLink}>
          <LogOut className="h-4 w-4 shrink-0 text-navy-400" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Phones and tablets: a slim top bar with the menu. */}
      <div className="no-print sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-navy-950 bg-navy-900 pl-4 pr-2 lg:hidden">
        <Link href="/dashboard" className="rounded-md">
          <Logo inverted compact size="sm" />
        </Link>
        <button type="button" onClick={() => setOpen(true)} className="rounded-md p-2.5 text-white transition-colors hover:bg-white/10" aria-label="Open menu" aria-expanded={open}>
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Desktop: the column runs the full height of the page; its contents stay pinned to the viewport. */}
      <aside className="no-print hidden w-60 shrink-0 border-r border-navy-950 bg-navy-900 lg:block">
        <div className="sticky top-0 h-dvh">{content}</div>
      </aside>

      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 animate-fade-in bg-navy-950/60" aria-label="Close menu" onClick={close} />
          <div className="absolute inset-y-0 left-0 w-[min(18rem,86vw)] animate-fade-in bg-navy-900 shadow-lift">
            <button type="button" onClick={close} className="absolute right-3 top-3.5 z-10 rounded-md p-1.5 text-navy-200 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {content}
          </div>
        </div>
      )}
    </>
  );
}
