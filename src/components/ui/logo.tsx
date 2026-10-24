import { cn } from "./cn";

export function LogoMark({ className, title = "OM Enterprise" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("shrink-0", className ?? "h-10 w-10")} role="img" aria-label={title}>
      <rect width="64" height="64" rx="10" fill="#0D1B30" />
      <path d="M12 29 L32 13 L52 29" fill="none" stroke="#C39222" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23" cy="42" r="8" fill="none" stroke="#FFFFFF" strokeWidth="4.5" />
      <path d="M35.5 50 V35 L42.5 44 L49.5 35 V50" fill="none" stroke="#FFFFFF" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
