import type { ReactNode } from "react";
import { cn } from "./cn";

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-navy-100 pb-5">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[13px] text-navy-500">{eyebrow}</div>}
        <h1 className="headline text-[1.625rem] font-bold text-navy-950 sm:text-[1.875rem]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-navy-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-navy-100 bg-paper/60 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-navy-400">{icon}</div>}
      <div className="text-base font-semibold text-navy-900">{title}</div>
      {description && <p className="mt-1 max-w-md text-sm leading-relaxed text-navy-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-navy-100/70", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-4">
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
    info: "border-navy-200 bg-navy-50/70 text-navy-800",
    warning: "border-amber-300 bg-amber-50 text-amber-950",
    danger: "border-red-200 bg-red-50 text-red-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  };
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm leading-relaxed", tones[tone], className)} role={tone === "danger" ? "alert" : "status"}>
      {title && <div className="font-semibold">{title}</div>}
      {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
    </div>
  );
}

/** Wrapper for data tables with horizontal scroll on small screens. */
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  // `relative` keeps visually hidden (sr-only) labels inside the scroll box, so they cannot widen the page.
  return <div className={cn("relative overflow-x-auto rounded-xl border border-navy-100 bg-white shadow-card", className)}>{children}</div>;
}

export const th = "label-caps whitespace-nowrap border-b border-navy-200 bg-paper/70 px-3 py-2.5 text-left text-navy-500";
export const td = "border-b border-navy-100 px-3 py-3 align-top text-sm text-navy-900";
