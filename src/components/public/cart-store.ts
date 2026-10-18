"use client";
/**
 * Visitor's enquiry list, kept only in this browser (localStorage). Prices are never stored or
 * trusted here — the server re-prices the list whenever it is shown or submitted.
 */
import { useSyncExternalStore } from "react";

export interface EnquiryItem {
  variantId: string;
  quantity: string;
  productName: string;
  variantName: string;
  slug: string;
  unit: string;
  unitDecimals: number;
}

const KEY = "om-enquiry-list-v1";
const EVENT = "om-enquiry-list-change";
const EMPTY: EnquiryItem[] = [];
const MAX_ITEMS = 50;

let cachedRaw: string | null | undefined;
let cached: EnquiryItem[] = EMPTY;
let memoryFallback: EnquiryItem[] | null = null;

function read(): EnquiryItem[] {
  if (memoryFallback) return memoryFallback;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cached = Array.isArray(parsed)
      ? (parsed as EnquiryItem[])
          .filter((i) => i && typeof i.variantId === "string" && typeof i.quantity === "string")
          .slice(0, MAX_ITEMS)
      : EMPTY;
  } catch {
    cached = EMPTY;
  }
  return cached;
}

function write(items: EnquiryItem[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
    memoryFallback = null;
  } catch {
    // Storage unavailable (private mode / blocked): keep the list for this page view only.
    memoryFallback = items;
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function roundQty(n: number, decimals: number) {
  const f = 10 ** decimals;
  return String(Math.round(n * f) / f);
}

export function useEnquiryList() {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);
  return {
    items,
    count: items.length,
    add(item: EnquiryItem) {
      const current = read();
      const existing = current.find((i) => i.variantId === item.variantId);
      if (existing) {
        const sum = roundQty(Number(existing.quantity) + Number(item.quantity), item.unitDecimals);
        write(current.map((i) => (i.variantId === item.variantId ? { ...i, ...item, quantity: sum } : i)));
      } else {
        write([...current, item].slice(0, MAX_ITEMS));
      }
    },
    setQuantity(variantId: string, quantity: string) {
      write(read().map((i) => (i.variantId === variantId ? { ...i, quantity } : i)));
    },
    remove(variantId: string) {
      write(read().filter((i) => i.variantId !== variantId));
    },
    clear() {
      write([]);
    },
  };
}
