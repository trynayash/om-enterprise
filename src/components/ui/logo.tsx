import Image from "next/image";
import { cn } from "./cn";

/** The shop's round badge logo (public/brand, made by scripts/brand-assets.mjs). Size it with h-/w- classes. */
export function LogoMark({ className, title = "OM Enterprise" }: { className?: string; title?: string }) {
  return <Image src="/brand/om-enterprise-logo.png" width={72} height={72} alt={title} className={cn("shrink-0 rounded-full", className ?? "h-10 w-10")} />;
}

export function Logo({ className, inverted, compact, size = "md" }: { className?: string; inverted?: boolean; compact?: boolean; size?: "sm" | "md" }) {
  const sm = size === "sm";
  return (
    <span className={cn("inline-flex items-center", sm ? "gap-2.5" : "gap-3", className)}>
      <LogoMark className={sm ? "h-9 w-9" : undefined} />
      <span className="whitespace-nowrap leading-none">
        <span
          className={cn("block font-bold [font-stretch:108%]", sm ? "text-[15px] tracking-[0.06em]" : "text-[19px] tracking-[0.07em]", inverted ? "text-white" : "text-navy-950")}
        >
          OM ENTERPRISE
        </span>
        {!compact && (
          <span className={cn("mt-1.5 block font-mono font-medium uppercase", sm ? "text-[8.5px] tracking-[0.1em]" : "text-[9.5px] tracking-[0.14em]", inverted ? "text-gold-400" : "text-gold-700")}>
            Your Complete Building Solution
          </span>
        )}
      </span>
    </span>
  );
}
