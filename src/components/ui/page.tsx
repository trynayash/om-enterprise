import type { ReactNode } from "react";
import { cn } from "./cn";

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-gold-600">{eyebrow}</div>}
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-navy-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-navy-200 bg-navy-50/50 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-navy-300">{icon}</div>}
      <div className="text-base font-bold text-navy-900">{title}</div>
      {description && <p className="mt-1 max-w-md text-sm text-navy-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-navy-100/70", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "warning" | "danger" | "success"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const tones = {
    info: "border-navy-200 bg-navy-50 text-navy-800",
    warning: "border-amber-300 bg-amber-50 text-amber-900",
    danger: "border-red-300 bg-red-50 text-red-900",
    success: "border-emerald-300 bg-emerald-50 text-emerald-900",
  };
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone], className)} role={tone === "danger" ? "alert" : "status"}>
      {title && <div className="font-bold">{title}</div>}
      {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
    </div>
  );
}

/** Wrapper for data tables with horizontal scroll on small screens. */
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-x-auto rounded-2xl border border-navy-100 bg-white shadow-card", className)}>{children}</div>;
}

export const th = "whitespace-nowrap border-b border-navy-100 bg-navy-50/60 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-navy-600";
export const td = "border-b border-navy-50 px-3 py-2.5 align-top text-sm text-navy-900";
