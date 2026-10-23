import { td, th } from "@/components/ui/page";

/*
 * Cell styles for dashboard tables, built on the shared `th` / `td`.
 * `cn()` doesn't merge Tailwind classes, and in the compiled CSS `text-navy-900` beats lighter
 * navy shades (and `text-xs` beats `text-sm`), so appending a colour or size to `td` silently loses.
 * These variants strip the base text classes first and set their own.
 */
const cell = td
  .split(" ")
  .filter((c) => !c.startsWith("text-"))
  .join(" ");

/** Plain cell (same as `td`). */
export const tdText = `${cell} text-sm text-navy-900`;
/** Secondary cell: dates, names of who did something. */
export const tdMuted = `${cell} text-sm text-navy-500`;
/** Money, quantities and counts: right-aligned monospace figures. */
export const tdNum = `${cell} whitespace-nowrap text-right font-mono text-[13px] tabular text-navy-900`;
/** SKUs, codes and document numbers that aren't links. */
export const tdCode = `${cell} whitespace-nowrap font-mono text-[12.5px] text-navy-700`;
/** Right-aligned header for numeric columns. */
export const thNum = th.replace("text-left", "text-right");
/** Re-exported so a table can take all its cell styles from one import. */
export { th };

/** Row hover used across dashboard tables. */
export const rowHover = "transition-colors duration-150 hover:bg-paper/60";

/** A link to a record (sale no., document no.) set in monospace. */
export const codeLink = "font-mono text-[13px] font-medium text-navy-900 underline-offset-[3px] hover:underline";
/** A link to a named record (product, customer). */
export const nameLink = "font-semibold text-navy-900 underline-offset-[3px] hover:underline";

/** Swap a cell's vertical padding (appending `py-2` to a cell style would lose to its `py-3`). */
export function withPy(cls: string, py: string) {
  return cls
    .split(" ")
    .map((c) => (c.startsWith("py-") ? py : c))
    .join(" ");
}
