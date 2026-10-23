import type { ReactNode } from "react";

/**
 * Status stamps set beside a condensed page title. Resets the headline's narrow width and tight
 * tracking so badges keep their normal proportions.
 */
export function TitleStamps({ children }: { children: ReactNode }) {
  return <span className="inline-flex flex-wrap items-center gap-1.5 self-center font-sans tracking-normal [font-stretch:100%]">{children}</span>;
}
