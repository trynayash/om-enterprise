"use client";
import { useSyncExternalStore, type ReactNode } from "react";

const subscribe = () => () => {};

/** Render children only after hydration (for components that read `window` during render). */
export function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return <>{mounted ? children : fallback}</>;
}
