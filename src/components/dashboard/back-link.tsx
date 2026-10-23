import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

/** "← All sales" above a detail page's header. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="no-print group mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-navy-500 transition-colors duration-150 hover:text-navy-900"
    >
      <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" aria-hidden />
      {children}
    </Link>
  );
}
