import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  align = "left",
  inverted,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  align?: "left" | "center";
  inverted?: boolean;
}) {
  return (
    <div className={cn("mb-8 flex flex-wrap items-end justify-between gap-4", align === "center" && "flex-col items-center text-center")}>
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        {eyebrow && (
          <div className={cn("mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em]", inverted ? "text-gold-400" : "text-gold-600", align === "center" && "justify-center")}>
            <span className="h-px w-6 bg-current" aria-hidden />
            {eyebrow}
          </div>
        )}
        <h2 className={cn("text-2xl font-extrabold tracking-tight sm:text-3xl", inverted ? "text-white" : "text-navy-900")}>{title}</h2>
        {description && <p className={cn("mt-2 text-base leading-relaxed", inverted ? "text-navy-200" : "text-navy-500")}>{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1.5 text-navy-500">
        {items.map((it, i) => (
          <li key={`${it.label}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="text-navy-300">/</span>}
            {it.href ? (
              <a href={it.href} className="hover:text-navy-900">
                {it.label}
              </a>
            ) : (
              <span aria-current="page" className="font-semibold text-navy-800">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
