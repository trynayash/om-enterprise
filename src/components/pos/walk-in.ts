"use client";
/**
 * Sales where the counter chose "walk-in, no details" in the customer step, remembered in this
 * browser so that reloading the sale screen does not ask again. Only the choice to skip is kept;
 * nothing about a customer is stored here.
 */
import { useSyncExternalStore } from "react";

const KEY = "om-pos-walk-in-sales";
const EVENT = "om-pos-walk-in-change";
const MAX = 40;
const NONE: string[] = [];

/** Kept for this page view when storage is unavailable (private mode / blocked). */
let memory: string[] | null = null;
let cachedRaw: string | null | undefined;
let cached: string[] = NONE;

function read(): string[] {
  if (memory) return memory;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === cachedRaw) return cached;
    cachedRaw = raw;
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cached = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : NONE;
    return cached;
  } catch {
    return NONE;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function setWalkIn(saleId: string, on: boolean) {
  const next = [...read().filter((id) => id !== saleId), ...(on ? [saleId] : [])].slice(-MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    memory = null;
  } catch {
    memory = next;
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Whether this sale was marked walk-in; false on the server and until the saved list is read. */
export function useWalkIn(saleId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => read().includes(saleId),
    () => false,
  );
}
