import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

export const OWNER = { username: "e2e.owner", password: "E2e-Owner-Pass-2026!" };

export async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

export function uniq(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

/** No horizontal page scroll (mobile layouts). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

/** Call the JSON API from a logged-in page context (same-origin, like the app does). */
export async function apiCall<T = unknown>(page: Page, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, data?: unknown): Promise<T> {
  const origin = new URL(page.url()).origin;
  const res = await page.request.fetch(path, {
    method,
    data: data === undefined ? undefined : data,
    headers: { Origin: origin, "Content-Type": "application/json" },
  });
  const json = (await res.json()) as { ok: boolean; data: T; error?: { message: string } };
  if (!json.ok) throw new Error(`${method} ${path} → ${res.status()}: ${json.error?.message}`);
  return json.data;
}

/** Create a paid, billed TRAINING sale with a SAMPLE product. Returns ids. */
export async function makeTrainingBill(page: Page, sku = "DEMO-PNT-INT-4L", quantity = "2") {
  const found = await apiCall<{ variantId: string }[]>(page, "GET", `/api/pos/search?q=${encodeURIComponent(sku)}`);
  const sale = await apiCall<{ id: string; saleNumber: string }>(page, "POST", "/api/sales", {});
  await apiCall(page, "POST", `/api/sales/${sale.id}/lines`, { variantId: found[0].variantId, quantity });
  const fin = await apiCall<{ grandTotal: string }>(page, "POST", `/api/sales/${sale.id}/finalize`, {});
  await apiCall(page, "POST", `/api/sales/${sale.id}/payments/verify`, {
    method: "cash",
    amount: fin.grandTotal,
    tenderedAmount: fin.grandTotal,
    verificationMethod: "cash_counted",
    confirmReceived: true,
  });
  const doc = await apiCall<{ id: string; docNumber: string }>(page, "POST", `/api/sales/${sale.id}/bill`, { customer: { name: "E2E Customer", mobile: "9876501234" } });
  return { saleId: sale.id, saleNumber: sale.saleNumber, grandTotal: fin.grandTotal, documentId: doc.id, docNumber: doc.docNumber };
}

/** A message the app "emailed" during the run: e2e runs write mail to a folder instead of sending it. */
export interface SentMail {
  to: string;
  subject: string;
  replyTo: string | null;
  text: string;
  attachments: { filename: string; file: string; bytes: number; content: Buffer }[];
}

const OUTBOX = join(process.cwd(), "storage", "e2e-outbox");

export function clearSentMail() {
  rmSync(OUTBOX, { recursive: true, force: true });
}

/** Everything emailed since `clearSentMail`, oldest first. */
export function sentMail(): SentMail[] {
  if (!existsSync(OUTBOX)) return [];
  return readdirSync(OUTBOX)
    .map((folder) => ({ folder, at: statSync(join(OUTBOX, folder)).mtimeMs }))
    .sort((a, b) => a.at - b.at)
    .map(({ folder }) => {
      const m = JSON.parse(readFileSync(join(OUTBOX, folder, "message.json"), "utf8"));
      return { ...m, attachments: m.attachments.map((a: { file: string }) => ({ ...a, content: readFileSync(join(OUTBOX, folder, a.file)) })) } as SentMail;
    });
}
