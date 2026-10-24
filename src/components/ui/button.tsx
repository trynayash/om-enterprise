import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "./cn";

type Variant = "primary" | "gold" | "outline" | "ghost" | "danger" | "success" | "white";
type Size = "sm" | "md" | "lg" | "xl";

// Flat fills with a hairline bottom edge; outline buttons firm up their border on hover.
const variants: Record<Variant, string> = {
  primary: "bg-navy-900 text-white shadow-[inset_0_-1px_0_rgb(0_0_0/0.35)] hover:bg-navy-800 active:bg-navy-950",
  gold: "bg-gold-500 text-navy-950 shadow-[inset_0_-1px_0_rgb(0_0_0/0.18)] hover:bg-gold-400 active:bg-gold-600",
  outline: "border border-navy-200 bg-white text-navy-900 hover:border-navy-900",
  ghost: "text-navy-800 hover:bg-navy-50 active:bg-navy-100",
  danger: "bg-red-700 text-white shadow-[inset_0_-1px_0_rgb(0_0_0/0.3)] hover:bg-red-800",
  success: "bg-emerald-700 text-white shadow-[inset_0_-1px_0_rgb(0_0_0/0.3)] hover:bg-emerald-800",
  white: "bg-white text-navy-900 shadow-[inset_0_-1px_0_rgb(13_27_48/0.12)] hover:bg-paper",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-md",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-lg",
  xl: "h-16 px-6 text-lg gap-3 rounded-xl",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex select-none items-center justify-center font-semibold tracking-[-0.005em] transition-[background-color,border-color,color,transform] duration-150 ease-out active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0",
    variants[variant],
    sizes[size],
    extra,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  icon,
  external,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
  icon?: ReactNode;
  external?: boolean;
}) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClass(variant, size, className)}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {icon}
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("h-4 w-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
