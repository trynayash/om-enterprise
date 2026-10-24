import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";

/**
 * Quiet frame for sign-in and account pages: one white sheet on engineering paper, the logo in a
 * ruled header, a mono stamp saying who the page is for, and an optional paper footer strip.
 */
export function AuthSheet({ stamp, children, footer }: { stamp?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="blueprint flex min-h-screen w-full flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[27rem] animate-rise overflow-hidden rounded-xl border border-navy-200 bg-white shadow-lift">
        <div className="flex items-center justify-between gap-4 border-b border-navy-100 px-6 py-4 sm:px-8">
          <Logo size="sm" />
          {stamp}
        </div>
        <div className="px-6 py-7 sm:px-8">{children}</div>
        {footer && <div className="border-t border-navy-100 bg-paper/70 px-6 py-3.5 text-center text-xs text-navy-500 sm:px-8">{footer}</div>}
      </div>
    </div>
  );
}

/** Small mono stamp in the sheet header ("Staff", "Account"…). */
export function SheetStamp({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return strong ? (
    <span className="rounded-[3px] bg-navy-950 px-1.5 py-[4px] font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.1em] text-gold-400">{children}</span>
  ) : (
    <span className="rounded-[3px] px-1.5 py-[3px] font-mono text-[10px] font-medium uppercase leading-none tracking-[0.1em] text-navy-500 ring-1 ring-inset ring-navy-200">
      {children}
    </span>
  );
}
