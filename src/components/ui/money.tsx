import { formatINR, formatPercent, formatQty } from "@/lib/money";
import { cn } from "./cn";

export function Money({ value, className, muted }: { value: string | null | undefined; className?: string; muted?: boolean }) {
  return <span className={cn("tabular whitespace-nowrap", muted && "text-navy-500", className)}>{formatINR(value)}</span>;
}
export function Qty({ value, unit }: { value: string; unit?: string }) {
  return (
    <span className="tabular whitespace-nowrap">
      {formatQty(value)}
      {unit ? <span className="text-navy-500"> {unit}</span> : null}
    </span>
  );
}
export function Pct({ value }: { value: string | null | undefined }) {
  return <span className="tabular">{formatPercent(value)}</span>;
}
export function DateTime({ value, dateOnly }: { value: string | Date | null | undefined; dateOnly?: boolean }) {
  if (!value) return <span className="text-navy-400">—</span>;
  const d = typeof value === "string" ? new Date(value) : value;
  return (
    <time dateTime={d.toISOString()} className="whitespace-nowrap tabular">
      {d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        ...(dateOnly ? {} : { hour: "2-digit", minute: "2-digit" }),
      })}
    </time>
  );
}
