"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

/** The variant chosen on a product page, shared by the size picker and the figure. */
const Ctx = createContext<{ selectedId: string; setSelectedId: (id: string) => void } | null>(null);

export function ProductSelection({ initialId, children }: { initialId: string; children: ReactNode }) {
  const [selectedId, setSelectedId] = useState(initialId);
  return <Ctx.Provider value={{ selectedId, setSelectedId }}>{children}</Ctx.Provider>;
}

/** The shared selection, or local state when used outside a ProductSelection. */
export function useProductSelection(fallbackId: string) {
  const shared = useContext(Ctx);
  const [selectedId, setSelectedId] = useState(fallbackId);
  return shared ?? { selectedId, setSelectedId };
}
