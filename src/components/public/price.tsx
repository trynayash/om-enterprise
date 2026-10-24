import type { PublicPrice } from "@/server/services/public-catalog";
import { formatPrice } from "@/lib/money";
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
    return <span className={cn("font-mono text-[13px] font-medium text-navy-500", size === "lg" && "text-base", className)}>Price on request</span>;
  }
  const showMrp = price.mrp !== null && Number(price.mrp) > Number(price.amount);
  if (size === "md") {
    // Catalogue cards: the price, with the MRP on a quiet line of its own. What prices include is
    // stated once on the page, not on every card.
    return (
      <span className={cn("block", className)}>
        <span className="flex items-baseline gap-2">
          {from && <span className="label-mono text-navy-500">from</span>}
          <span className="font-mono text-[17px] font-semibold tabular tracking-[-0.02em] text-navy-950">{formatPrice(price.amount)}</span>
        </span>
        {showMrp && <span className="mt-0.5 block font-mono text-[11.5px] text-navy-400 line-through tabular">MRP {formatPrice(price.mrp)}</span>}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      {from && <span className="label-mono text-navy-500">from</span>}
      <span className="font-mono text-3xl font-semibold tabular tracking-[-0.02em] text-navy-950 sm:text-[2.5rem]">{formatPrice(price.amount)}</span>
      {showMrp && <span className="font-mono text-[13px] text-navy-400 line-through tabular">MRP {formatPrice(price.mrp)}</span>}
      {price.taxLabel && <span className="text-xs text-navy-500">{price.taxLabel}</span>}
    </span>
  );
}
