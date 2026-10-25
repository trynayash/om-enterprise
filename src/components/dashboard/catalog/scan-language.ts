"use client";
/**
 * The language of scans and photos the user picked for imports, kept only in this browser
 * (localStorage). English until a choice is made.
 */
import { useSyncExternalStore } from "react";
import { OCR_LANGUAGE_CHOICES } from "@/lib/import-files";

const KEY = "om-import-scan-language";
const EVENT = "om-import-scan-language-change";
const DEFAULT = OCR_LANGUAGE_CHOICES[0].id;

/** Kept for this page view when storage is unavailable (private mode / blocked). */
let memoryFallback: string | null = null;

const valid = (id: string | null): id is string => !!id && OCR_LANGUAGE_CHOICES.some((c) => c.id === id);

function read(): string {
  if (memoryFallback) return memoryFallback;
  try {
    const saved = window.localStorage.getItem(KEY);
    return valid(saved) ? saved : DEFAULT;
  } catch {
    return DEFAULT;
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

export function chooseScanLanguage(id: string) {
  if (!valid(id)) return;
  try {
    window.localStorage.setItem(KEY, id);
    memoryFallback = null;
  } catch {
    memoryFallback = id;
  }
  window.dispatchEvent(new Event(EVENT));
}

/** The chosen language id; English on the server and until the browser's saved choice is read. */
export function useScanLanguage(): string {
  return useSyncExternalStore(subscribe, read, () => DEFAULT);
}
