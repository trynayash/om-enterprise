"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

export interface PosNavItem {
  href: string;
  label: string;
}

function isActive(pathname: string, href: string) {
  if (href === "/pos") return pathname === "/pos" || pathname.startsWith("/pos/sale") || pathname.startsWith("/pos/documents");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** POS navigation: inline on desktop, a scrollable strip under the header on phones/tablets. */
export function PosNavLinks({ items, variant }: { items: PosNavItem[]; variant: "desktop" | "mobile" }) {
  const pathname = usePathname();
  if (variant === "mobile") {
    return (
      <nav className="flex gap-1 overflow-x-auto border-t border-white/10 px-3 py-1.5 text-sm md:hidden" aria-label="POS">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={isActive(pathname, i.href) ? "page" : undefined}
            className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 font-semibold", isActive(pathname, i.href) ? "bg-white/15 text-white" : "text-navy-200")}
          >
            {i.label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav className="ml-2 hidden items-center gap-1 text-sm md:flex" aria-label="POS">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={isActive(pathname, i.href) ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 font-medium transition-colors",
            isActive(pathname, i.href) ? "bg-white/10 text-white" : "text-navy-200 hover:bg-white/10 hover:text-white",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
