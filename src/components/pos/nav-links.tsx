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

/** POS navigation: inline on desktop, a scrollable strip under the header on phones/tablets. The active page carries a brass rule. */
export function PosNavLinks({ items, variant }: { items: PosNavItem[]; variant: "desktop" | "mobile" }) {
  const pathname = usePathname();
  const mobile = variant === "mobile";
  return (
    <nav
      className={cn(
        "items-stretch text-sm",
        mobile ? "flex h-11 overflow-x-auto border-t border-white/10 px-1.5 md:hidden" : "ml-3 hidden md:flex",
      )}
      aria-label="POS"
    >
      {items.map((i) => {
        const active = isActive(pathname, i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex shrink-0 items-center whitespace-nowrap px-3 font-medium transition-colors duration-150",
              active ? "text-white" : "text-navy-300 hover:text-white",
            )}
          >
            {i.label}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-3 bottom-0 h-[2px] origin-left bg-gold-500 transition-transform duration-200 ease-out",
                active ? "scale-x-100" : "scale-x-0",
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
