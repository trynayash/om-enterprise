"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/** Hides the floating WhatsApp button where it would cover the page's own actions (the enquiry list). */
export function FloatGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  return path?.startsWith("/enquiry") ? null : children;
}
