"use client";
import { useState } from "react";
import { cn } from "@/components/ui/cn";
import { TechnicalDrawing, type DrawingKind } from "./technical-drawing";
import { useProductSelection } from "./product-selection";
import { PageFigureTransition } from "./figure-transition";

interface FigureVariant {
  id: string;
  name: string;
  sku: string;
  attributes: Record<string, string>;
}

/**
 * The product's figure: its photos, or a technical drawing with a title block that follows the
 * selected size. Takes over the opened catalogue card's figure as the page loads.
 */
export function ProductGallery({
  images,
  name,
  kind,
  variants,
  variantAttributes,
}: {
  images: { url: string; alt: string | null }[];
  name: string;
  kind: DrawingKind;
  variants: FigureVariant[];
  variantAttributes: string[];
}) {
  const [active, setActive] = useState(0);
  const { selectedId } = useProductSelection(variants[0]?.id ?? "");
  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];
  const sizeAttr = variantAttributes.find((a) => selected?.attributes[a]);
  const size = selected ? (sizeAttr ? selected.attributes[sizeAttr] : selected.name) : null;

  if (!images.length) {
    return (
      <figure>
        <PageFigureTransition>
          <div className="blueprint relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-navy-200">
            <TechnicalDrawing kind={kind} animate title={`${name} — line drawing`} className="absolute inset-x-0 top-[5%] mx-auto h-[60%] w-[78%] sm:top-[6%] sm:h-[70%]" />
            <dl className="absolute bottom-3 right-3 grid w-[min(19rem,calc(100%-1.5rem))] grid-cols-[auto_1fr] border border-navy-800 bg-white/95 font-mono text-[10.5px] leading-tight text-navy-900">
              <dt className="border-b border-r border-navy-800 px-2 py-1.5 uppercase text-navy-500">Part</dt>
              <dd className="truncate border-b border-navy-800 px-2 py-1.5">{name}</dd>
              {size && (
                <>
                  <dt className="border-b border-r border-navy-800 px-2 py-1.5 uppercase text-navy-500">{sizeAttr ?? "Option"}</dt>
                  <dd key={size} className="animate-fade-in truncate border-b border-navy-800 px-2 py-1.5 font-medium">
                    {size}
                  </dd>
                </>
              )}
              {selected && (
                <>
                  <dt className="border-r border-navy-800 px-2 py-1.5 uppercase text-navy-500">SKU</dt>
                  <dd key={selected.sku} className="flex animate-fade-in justify-between gap-2 px-2 py-1.5">
                    <span className="truncate">{selected.sku}</span>
                    <span className="shrink-0 text-navy-400">NTS</span>
                  </dd>
                </>
              )}
            </dl>
          </div>
        </PageFigureTransition>
        <figcaption className="mt-2.5 font-mono text-[11px] text-navy-400">Illustration — not to scale. Ask us for a photo of the exact item.</figcaption>
      </figure>
    );
  }

  const current = images[Math.min(active, images.length - 1)];
  return (
    <div>
      <PageFigureTransition>
        <div className="overflow-hidden rounded-xl border border-navy-200 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element -- served by /uploads (re-encoded WebP) */}
          <img key={current.url} src={current.url} alt={current.alt ?? name} className="aspect-[4/3] w-full animate-fade-in object-contain p-6" />
        </div>
      </PageFigureTransition>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.url}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show image ${i + 1}`}
              aria-pressed={i === active}
              className={cn(
                "h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-white p-1 transition-colors",
                i === active ? "border-navy-900 ring-2 ring-gold-300/60" : "border-navy-200 hover:border-navy-400",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
