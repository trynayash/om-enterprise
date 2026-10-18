import type { PublicPrice } from "@/server/services/public-catalog";
import { formatINR } from "@/lib/money";
import { cn } from "@/components/ui/cn";

export function PriceTag({
  price,
  from,
  size = "md",
  className,
}: {
  price: PublicPrice | null;
  from?: boolean;
  size?: "md" | "lg";
  className?: string;
}) {
  if (!price) {
    return <span className={cn("text-sm font-semibold text-navy-500", className)}>Price on request</span>;
  }
  const showMrp = price.mrp !== null && Number(price.mrp) > Number(price.amount);
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      {from && <span className="text-xs font-medium text-navy-500">from</span>}
      <span className={cn("font-extrabold tabular text-navy-900", size === "lg" ? "text-3xl sm:text-4xl" : "text-lg")}>{formatINR(price.amount)}</span>
      {showMrp && <span className="text-sm text-navy-400 line-through tabular">MRP {formatINR(price.mrp)}</span>}
      {price.taxLabel && <span className="text-xs font-medium text-navy-500">{price.taxLabel}</span>}
    </span>
  );
}
