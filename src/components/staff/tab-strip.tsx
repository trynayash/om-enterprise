"use client";
import { useCallback, type ReactNode } from "react";

/**
 * A row of tabs that may scroll sideways on a phone. When it opens, the current tab
 * (`aria-current="page"`) is brought into view, so a tab further along the row is never
 * selected but hidden. Pair it with `scroll-fade-x` so the cut-off edge shows the row goes on.
 */
export function TabStrip({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const current = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (!current) return;
    const right = current.offsetLeft + current.offsetWidth;
    // Leave room for the faded edge (2.5rem) so the tab isn't half under it.
    if (right > el.clientWidth - 40) el.scrollLeft = right - el.clientWidth + 56;
  }, []);
  return (
    <nav ref={ref} className={className} aria-label={label}>
      {children}
    </nav>
  );
}
