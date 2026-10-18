/** Helpers for reading dashboard list filters from `searchParams`. */

export type SearchParams = Record<string, string | string[] | undefined>;

export function str(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : undefined;
}

export function num(sp: SearchParams, key: string, fallback: number): number {
  const n = Number(str(sp, key));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const IST_OFFSET_MS = 5.5 * 3600_000;

/** YYYY-MM-DD (IST calendar day) → start of that day as a UTC Date. */
export function istDay(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
}

/** `from` inclusive, `to` inclusive (converted to the start of the next day). */
export function dayRange(sp: SearchParams): { from?: Date; to?: Date } {
  const from = istDay(str(sp, "from"));
  const to = istDay(str(sp, "to"));
  return { from, to: to ? new Date(to.getTime() + 86400_000) : undefined };
}

/** Build a query string from the current params with overrides (undefined/"" removes a key). */
export function withParams(sp: SearchParams, overrides: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s) q.set(k, s);
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined || v === "") q.delete(k);
    else q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** IST calendar date of a timestamp as YYYY-MM-DD. */
export function istDateKey(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
