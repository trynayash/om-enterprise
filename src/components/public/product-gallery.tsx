"use client";
import { useState } from "react";
import { cn } from "@/components/ui/cn";
import { TechnicalDrawing, type DrawingKind } from "./technical-drawing";
import { PageFigureTransition } from "./figure-transition";

/**
 * The product's figure: its photos, or a line drawing when there are none. Takes over the opened
 * catalogue card's figure as the page loads.
 */
export function ProductGallery({ images, name, kind }: { images: { url: string; alt: string | null }[]; name: string; kind: DrawingKind }) {
  const [active, setActive] = useState(0);

  if (!images.length) {
    return (
      <figure>
        <PageFigureTransition>
          <div className="blueprint relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-navy-200">
            <TechnicalDrawing kind={kind} animate title={`${name} — line drawing`} className="absolute inset-0 m-auto h-[72%] w-[78%]" />
          </div>
        </PageFigureTransition>
        <figcaption className="mt-2.5 text-xs text-navy-500">Illustration, not to scale. Ask us for a photo of the exact item.</figcaption>
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
