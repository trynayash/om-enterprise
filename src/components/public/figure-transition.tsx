"use client";
import Link from "next/link";
import { useSyncExternalStore, ViewTransition, type ComponentProps, type ReactNode } from "react";

/**
 * The product page loads behind a skeleton, so a card and the page's figure are never on screen in
 * the same commit. Instead, only the card the shopper opened carries the shared name; the skeleton's
 * figure takes it over, then hands it to the real figure once the product arrives.
 */
const NAME = "product-figure";

let opened: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function open(slug: string) {
  opened = slug;
  listeners.forEach((l) => l());
}

/** The figure on a catalogue card: shares its name only after the card is opened. */
export function CardFigureTransition({ slug, children }: { slug: string; children: ReactNode }) {
  const isOpened = useSyncExternalStore(subscribe, () => opened === slug, () => false);
  return (
    <ViewTransition name={isOpened ? NAME : undefined} share={NAME} default="none">
      {children}
    </ViewTransition>
  );
}

/** The figure on the product page (and its skeleton). There is only ever one per page. */
export function PageFigureTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition name={NAME} share={NAME} default="none">
      {children}
    </ViewTransition>
  );
}

/** A link to a product that marks its card as the one being opened. */
export function ProductLink({ slug, onClick, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { slug: string }) {
  return (
    <Link
      {...props}
      href={`/products/${slug}`}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) open(slug);
      }}
    />
  );
}
