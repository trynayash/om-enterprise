import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

/** The small line above a heading (a place, a count). */
export function Eyebrow({ children, inverted, className }: { children: ReactNode; inverted?: boolean; className?: string }) {
  return <div className={cn("flex items-center gap-2 text-[13px] font-medium", inverted ? "text-gold-400" : "text-gold-700", className)}>{children}</div>;
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
    <div className={cn("mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4", align === "center" && "flex-col items-center text-center")}>
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        {eyebrow && (
          <Eyebrow inverted={inverted} className={cn("mb-2", align === "center" && "justify-center")}>
            {eyebrow}
          </Eyebrow>
        )}
        <h2 className={cn("headline text-[1.625rem] font-bold sm:text-[2rem]", inverted ? "text-white" : "text-navy-950")}>{title}</h2>
        {description && <p className={cn("mt-3 text-[15px] leading-relaxed", inverted ? "text-navy-200" : "text-navy-500")}>{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Header band for inner pages: paper background, breadcrumbs, title. */
export function PageIntro({
  crumbs,
  eyebrow,
  title,
  description,
  aside,
  children,
}: {
  crumbs?: { href?: string; label: string }[];
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="border-b border-rule bg-paper">
      <Container className="py-8 sm:py-10">
        {crumbs && <Breadcrumbs items={crumbs} />}
        <div className={cn("flex flex-wrap items-end justify-between gap-6", crumbs && "mt-6")}>
          <div className="max-w-3xl">
            {eyebrow && <Eyebrow className="mb-2">{eyebrow}</Eyebrow>}
            <h1 className="headline animate-rise text-[2rem] font-bold text-navy-950 sm:text-[2.5rem]">{title}</h1>
            {description && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-navy-600">{description}</p>}
          </div>
          {aside}
        </div>
        {children}
      </Container>
    </section>
  );
}

export function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-navy-500">
        {items.map((it, i) => (
          <li key={`${it.label}-${i}`} className="flex items-center gap-2">
            {it.href ? (
              <Link href={it.href} className="link-draw hover:text-navy-950">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-navy-900">
                {it.label}
              </span>
            )}
            {/* After the item, so a wrapped line ends with the separator instead of starting with it. */}
            {i < items.length - 1 && (
              <span aria-hidden className="text-navy-300">
                /
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
