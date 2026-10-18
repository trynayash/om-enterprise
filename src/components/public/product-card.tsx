import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { PublicProductCard } from "@/server/services/public-catalog";
import { SampleBadge } from "@/components/ui/badge";
import { PriceTag } from "./price";
import { ProductArt } from "./category-icon";

export function ProductCard({ p }: { p: PublicProductCard }) {
  return (
    <Link
      href={`/products/${p.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-gold-300 hover:shadow-lift"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by /uploads (already re-encoded WebP)
          <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <ProductArt icon={p.categoryIcon} className="h-full w-full transition-transform duration-300 group-hover:scale-[1.02]" />
        )}
        {p.isSample && <SampleBadge className="absolute left-3 top-3" />}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold-600">{p.brand ?? p.category}</div>
        <h3 className="mt-1 line-clamp-2 font-bold leading-snug text-navy-900">{p.name}</h3>
        {p.brand && <div className="mt-0.5 text-xs text-navy-500">{p.category}</div>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <div className="min-w-0">
            <PriceTag price={p.priceFrom} from={p.variantCount > 1} />
            {p.variantCount > 1 && <div className="mt-0.5 text-xs text-navy-500">{p.variantCount} options</div>}
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy-700 transition-colors group-hover:bg-gold-500 group-hover:text-navy-950">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({ items }: { items: PublicProductCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((p) => (
        <ProductCard key={p.slug} p={p} />
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Loading products">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-navy-100 bg-white">
          <div className="aspect-[4/3] animate-pulse bg-navy-50" />
          <div className="space-y-2 p-4">
            <div className="h-3 w-20 animate-pulse rounded bg-navy-100" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-navy-100" />
            <div className="h-5 w-24 animate-pulse rounded bg-navy-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
