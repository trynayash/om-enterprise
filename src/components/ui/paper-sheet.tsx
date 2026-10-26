import type { ReactNode } from "react";
import { Logo } from "./logo";

/**
 * Quiet frame for sign-in, account and error pages: one white sheet on a paper background, the logo
 * in a ruled header, a small label saying what the page is, and an optional paper footer strip.
 */
export function PaperSheet({ stamp, children, footer }: { stamp?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full flex-1 flex-col items-center justify-center bg-paper px-4 py-10">
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

/** Small label in the sheet header ("Staff", "Account"…). */
export function SheetStamp({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return <span className={strong ? "text-[13px] font-semibold text-navy-950" : "text-[13px] text-navy-500"}>{children}</span>;
}
