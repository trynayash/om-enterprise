import { numberText, type ImportTable } from "./text";

/** JSON exports: a list of records, or records under a key such as "products" or "items". */
export function readJson(text: string): ImportTable[] {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    throw new Error("That file is not valid JSON");
  }
  const lists: [string, Record<string, unknown>[]][] = [];
  const isRecords = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === "object" && !Array.isArray(x));
  if (isRecords(data)) lists.push(["Records", data]);
  else if (data && typeof data === "object") for (const [k, v] of Object.entries(data)) if (isRecords(v)) lists.push([k, v]);
  if (!lists.length) throw new Error("No list of records was found in that JSON file");
  return lists.map(([name, records]) => {
    const keys = [...new Set(records.slice(0, 100_000).flatMap((r) => Object.keys(r)))];
    const cell = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "number" ? numberText(v) : typeof v === "object" ? JSON.stringify(v) : String(v));
    return { name, rows: [keys, ...records.slice(0, 100_000).map((r) => keys.map((k) => cell(r[k])))] };
  });
}
