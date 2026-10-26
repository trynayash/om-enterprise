import type { ReactNode } from "react";

/** Status badges set beside a page title. Resets the headline's tight tracking for the badges. */
export function TitleStamps({ children }: { children: ReactNode }) {
  return <span className="inline-flex flex-wrap items-center gap-1.5 self-center tracking-normal">{children}</span>;
}
