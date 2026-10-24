import type { ReactNode } from "react";
import { cn } from "./cn";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-navy-100 bg-white shadow-card", className)}>{children}</div>;
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-navy-100 px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-navy-900">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] leading-relaxed text-navy-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

export function Stat({ label, value, hint, tone = "navy" }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "navy" | "gold" | "green" | "red" }) {
  const tones = { navy: "text-navy-900", gold: "text-gold-700", green: "text-emerald-700", red: "text-red-700" };
  const rules = { navy: "bg-navy-900", gold: "bg-gold-500", green: "bg-emerald-600", red: "bg-red-600" };
  return (
    <Card className="relative overflow-hidden p-4">
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", rules[tone])} />
      <div className="label-mono text-navy-500">{label}</div>
      <div className={cn("headline mt-2 text-[2rem] font-bold tabular", tones[tone])}>{value}</div>
      {hint && <div className="mt-1.5 text-xs leading-snug text-navy-500">{hint}</div>}
    </Card>
  );
}
