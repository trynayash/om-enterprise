import type { PublicPrice } from "@/server/services/public-catalog";
import { formatPrice } from "@/lib/money";
import { cn } from "@/components/ui/cn";

export function PriceTag({
  price,
  from,
  note,
  size = "md",
  className,
}: {
  price: PublicPrice | null;
  from?: boolean;
  /** Cards only: a short note on the line under the price, e.g. "6 sizes". */
  note?: string;
  size?: "md" | "lg";
  className?: string;
}) {
  if (!price) {
    const label = <span className={cn("font-mono text-[13px] font-medium text-navy-500", size === "lg" && "text-base", size === "lg" && className)}>Price on request</span>;
    if (size === "lg") return label;
    return (
      <span className={cn("block", className)}>
        <span className="flex h-[1.55rem] items-end">{label}</span>
        <span className="mt-0.5 flex min-h-[1.1rem] font-mono text-[11.5px] text-navy-400">{note ?? <span aria-hidden>&nbsp;</span>}</span>
      </span>
    );
  }
  const showMrp = price.mrp !== null && Number(price.mrp) > Number(price.amount);
  if (size === "md") {
    // Catalogue cards: the price, then one quiet line (MRP and/or a note such as the number of sizes)
    // that is always there, so prices line up across a row. What prices include is said once per page.
    const second = [showMrp ? <span key="mrp" className="line-through">MRP {formatPrice(price.mrp)}</span> : null, note ? <span key="note">{note}</span> : null].filter(Boolean);
    return (
      <span className={cn("block", className)}>
        <span className="flex items-baseline gap-2">
          {from && <span className="label-caps text-navy-500">from</span>}
          <span className="font-mono text-[17px] font-semibold tabular tracking-[-0.02em] text-navy-950">{formatPrice(price.amount)}</span>
        </span>
        <span className="mt-0.5 flex min-h-[1.1rem] flex-wrap gap-x-2 font-mono text-[11.5px] text-navy-400 tabular">
          {second.length ? second : <span aria-hidden>&nbsp;</span>}
        </span>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      {from && <span className="label-caps text-navy-500">from</span>}
      <span className="font-mono text-3xl font-semibold tabular tracking-[-0.02em] text-navy-950 sm:text-[2.5rem]">{formatPrice(price.amount)}</span>
      {showMrp && <span className="font-mono text-[13px] text-navy-400 line-through tabular">MRP {formatPrice(price.mrp)}</span>}
      {price.taxLabel && <span className="text-xs text-navy-500">{price.taxLabel}</span>}
    </span>
  );
}
