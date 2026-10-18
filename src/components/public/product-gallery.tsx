"use client";
import { useState } from "react";
import { cn } from "@/components/ui/cn";
import { ProductArt } from "./category-icon";

export function ProductGallery({ images, name, icon }: { images: { url: string; alt: string | null }[]; name: string; icon: string | null }) {
  const [active, setActive] = useState(0);
  if (!images.length) {
    return <ProductArt icon={icon} large label={`${name} — no photo available yet`} className="aspect-square w-full rounded-3xl border border-navy-100" />;
  }
  const current = images[Math.min(active, images.length - 1)];
  return (
    <div>
      <div className="overflow-hidden rounded-3xl border border-navy-100 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- served by /uploads (re-encoded WebP) */}
        <img src={current.url} alt={current.alt ?? name} className="aspect-square w-full object-contain" />
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.url}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show image ${i + 1}`}
              aria-pressed={i === active}
              className={cn("h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 bg-white", i === active ? "border-gold-500" : "border-navy-100 hover:border-navy-300")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
