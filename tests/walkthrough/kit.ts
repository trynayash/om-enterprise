/**
 * Recording kit for the narrated walkthrough (`npm run walkthrough`).
 *
 * Every video shows a title card, a caption bar describing each step, a highlight on everything
 * that is clicked, and a ✅ / ❌ for each check. Checks never stop the recording: a failed check is
 * shown in red, written to the results file and fails the test at the end, so the report is honest.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

export { expect, test };

/* ------------------------------------------------------------------ */
/* Accounts used across the videos (demo values for recordings only)   */
/* ------------------------------------------------------------------ */

export const OWNER = { username: "Kishan", name: "Kishan Suthar", temp: "Walkthrough-Temp-2026", password: "Navy-Gold-Owner-2026", secret: "Gold-Key-4729" };
export const YASH = { username: "yash", name: "Yash", role: "admin", temp: "Blue-Temp-Pass-2026", password: "Blue-Own-Pass-2026" };
export const VIKRAM = { username: "vikram", name: "Vikram Uncle", role: "admin", temp: "Green-Temp-Pass-2026", password: "Green-Own-Pass-2026" };
export const SACHIN = { username: "sachin", name: "Sachin", role: "sales", temp: "Red-Temp-Pass-2026", password: "Red-Own-Pass-2026" };
export type Account = { username: string; password: string; secret?: string };

/** Clearly-labelled test item used for real (non-sample) bills in the videos. */
export const TEST_ITEM = { product: "TEST Pressure Pipe (not a real product)", variant: "1 inch × 3 m", sku: "TEST-PP-25", price: "420", cost: "250" };

const RESULTS_DIR = path.resolve("walkthrough-output/results");

/* ------------------------------------------------------------------ */
/* Overlay: caption bar, title card, check list                        */
/* ------------------------------------------------------------------ */

type OverlayState = { caption?: string; step?: number; checks?: { ok: boolean; label: string }[]; video?: string };

/** Injected into every page: re-draws the overlay from sessionStorage after each navigation. */
function overlayInit() {
  const KEY = "__wt";
  const css = `
    #__wt{position:fixed;inset:auto 0 0 0;z-index:2147483647;pointer-events:none;font:600 16px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:0;border:0;background:transparent;width:100%;height:auto;overflow:visible;inset-block-start:auto}
    #__wt .cap{margin:0 auto 14px;max-width:min(1100px,calc(100vw - 24px));background:rgba(11,27,51,.94);color:#fff;border-radius:14px;padding:10px 16px;box-shadow:0 8px 30px rgba(0,0,0,.35);display:flex;gap:12px;align-items:flex-start;border:1px solid rgba(212,165,55,.55)}
    #__wt .num{background:#d4a537;color:#0b1b33;border-radius:999px;min-width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex:none}
    #__wt .vid{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#d4a537;margin-bottom:2px}
    #__wt .checks{position:fixed;top:10px;right:10px;display:flex;flex-direction:column;gap:6px;max-width:min(420px,calc(100vw - 20px))}
    #__wt .chk{background:rgba(255,255,255,.97);color:#0b1b33;border-radius:10px;padding:6px 10px;font-size:13px;box-shadow:0 4px 18px rgba(0,0,0,.18);border-left:5px solid #16a34a}
    #__wt .chk.bad{border-left-color:#dc2626;background:#fef2f2;color:#7f1d1d}
    @media (max-width:500px){#__wt{font-size:13px}#__wt .cap{padding:8px 10px;margin-bottom:8px}#__wt .checks{top:6px;right:6px}#__wt .chk{font-size:11px}}`;
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const render = () => {
    if (!document.body) return;
    let st: OverlayState = {};
    try {
      st = JSON.parse(sessionStorage.getItem(KEY) || "{}");
    } catch {}
    let el = document.getElementById("__wt") as (HTMLElement & { showPopover?: () => void; hidePopover?: () => void }) | null;
    if (!el) {
      el = document.createElement("div");
      el.id = "__wt";
      el.setAttribute("popover", "manual");
      const style = document.createElement("style");
      style.textContent = css;
      el.appendChild(style);
      el.appendChild(document.createElement("div")).className = "body";
      document.body.appendChild(el);
    }
    const body = el.querySelector(".body")!;
    const checks = (st.checks ?? []).slice(-4);
    body.innerHTML =
      (st.caption
        ? `<div class="cap"><span class="num">${st.step ?? ""}</span><span>${st.video ? `<span class="vid">${esc(st.video)}</span>` : ""}${esc(st.caption)}</span></div>`
        : "") +
      `<div class="checks">${checks.map((c) => `<div class="chk ${c.ok ? "" : "bad"}">${c.ok ? "✅" : "❌"} ${esc(c.label)}</div>`).join("")}</div>`;
    // Popover = top layer, so captions stay visible above modal dialogs.
    try {
      if (el.matches(":popover-open")) el.hidePopover?.();
      el.showPopover?.();
    } catch {}
  };
  (window as unknown as { __wtRender: () => void }).__wtRender = render;
  document.addEventListener("DOMContentLoaded", render);
  window.addEventListener("load", render);
  setInterval(() => {
    const el = document.getElementById("__wt");
    if (!el || !el.isConnected || document.querySelector("dialog[open]")) render();
  }, 400);
}

export async function prepareContext(ctx: BrowserContext) {
  await ctx.addInitScript(overlayInit);
}

async function setOverlay(page: Page, patch: Partial<OverlayState>) {
  await page
    .evaluate((p) => {
      const st = JSON.parse(sessionStorage.getItem("__wt") || "{}");
      sessionStorage.setItem("__wt", JSON.stringify({ ...st, ...p }));
      (window as unknown as { __wtRender?: () => void }).__wtRender?.();
    }, patch)
    .catch(() => {});
}

/* ------------------------------------------------------------------ */
/* Narration & checks                                                  */
/* ------------------------------------------------------------------ */

type CheckResult = { label: string; ok: boolean; error?: string; page: string };

class Recorder {
  step = 0;
  finished = false;
  checks: CheckResult[] = [];
  constructor(
    public video: string,
    public area: string,
  ) {}
}
const recorders = new WeakMap<Page, Recorder>();
let current: Recorder | null = null;

/** Full-screen title card at the start of a video. */
export async function titleCard(page: Page, video: string, title: string, subtitle: string) {
  const rec = new Recorder(video, title);
  current = rec;
  recorders.set(page, rec);
  if (page.url() === "about:blank") await page.goto("/robots.txt").catch(() => {});
  await page.evaluate(
    ([v, t, s]) => {
      sessionStorage.setItem("__wt", JSON.stringify({ video: v, checks: [] }));
      const d = document.createElement("div");
      d.id = "__wt_title";
      d.setAttribute("popover", "manual");
      d.style.cssText =
        "position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;border:0;padding:6vw;box-sizing:border-box;background:radial-gradient(ellipse at top right,#1f3c6b,#0b1b33 60%);color:#fff;display:flex;flex-direction:column;justify-content:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;z-index:2147483647";
      d.innerHTML = `<div style="color:#d4a537;font-weight:800;letter-spacing:.2em;font-size:clamp(11px,1.6vw,16px)">OM ENTERPRISE · RECORDED WALKTHROUGH · ${v}</div><div style="font-weight:800;font-size:clamp(26px,5vw,56px);margin:14px 0;line-height:1.1">${t}</div><div style="font-size:clamp(14px,2vw,22px);color:#c9d6ea;max-width:900px;line-height:1.4">${s}</div>`;
      document.body.appendChild(d);
      (d as unknown as { showPopover: () => void }).showPopover();
    },
    [video, title, subtitle],
  );
  await page.waitForTimeout(2800);
  await page.evaluate(() => document.getElementById("__wt_title")?.remove()).catch(() => {});
}

/** Caption for the next step; pauses long enough to read it. */
export async function say(page: Page, text: string) {
  const rec = recorders.get(page) ?? current;
  if (rec) {
    rec.step += 1;
    recorders.set(page, rec);
  }
  await setOverlay(page, { caption: text, step: rec?.step, video: rec?.video });
  await page.waitForTimeout(Math.min(3200, 900 + text.length * 22));
}

/** Run a check; show ✅ or ❌ on screen and record it. Never throws (the test fails at the end). */
export async function check(page: Page, label: string, fn: () => unknown) {
  const rec = recorders.get(page) ?? current;
  let ok = true;
  let error: string | undefined;
  try {
    await fn();
  } catch (e) {
    ok = false;
    error = (e instanceof Error ? e.message : String(e)).split("\n").slice(0, 3).join(" ").slice(0, 400);
  }
  rec?.checks.push({ label, ok, error, page: page.url().replace(/^https?:\/\/[^/]+/, "") });
  const shown = rec?.checks.map((c) => ({ ok: c.ok, label: c.label })) ?? [{ ok, label }];
  await setOverlay(page, { checks: shown });
  await page.waitForTimeout(ok ? 900 : 1800);
  return ok;
}

/** Share a recorder with a second page (e.g. a manager's browser in the same video). */
export function follow(page: Page, leader: Page) {
  const rec = recorders.get(leader) ?? current;
  if (rec) recorders.set(page, rec);
}

/** Write this video's results; fail the test if any check failed (after the recording is complete). */
export async function finish(page: Page) {
  const rec = recorders.get(page) ?? current;
  if (!rec) return;
  rec.finished = true;
  writeResults(rec);
  await setOverlay(page, { caption: `Done — ${rec.checks.filter((c) => c.ok).length} of ${rec.checks.length} checks passed` });
  await page.waitForTimeout(2200);
  const failed = rec.checks.filter((c) => !c.ok);
  expect(failed.map((f) => `${f.label}: ${f.error}`), "failed checks").toEqual([]);
}

/* ------------------------------------------------------------------ */
/* Interaction helpers                                                 */
/* ------------------------------------------------------------------ */

/** Highlight, then click — so viewers can see what was pressed. */
export async function tap(target: Locator) {
  await ready(target.page());
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target
    .evaluate((el: HTMLElement) => {
      const prev = el.style.boxShadow;
      el.style.boxShadow = "0 0 0 4px #d4a537, 0 0 0 8px rgba(212,165,55,.35)";
      setTimeout(() => (el.style.boxShadow = prev), 900);
    })
    .catch(() => {});
  await target.page().waitForTimeout(450);
  await target.click();
}

/** Type visibly (character by character) into a field. */
export async function type(target: Locator, text: string) {
  await ready(target.page());
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click();
  await target.fill("");
  await target.pressSequentially(text, { delay: 35 });
}

/** A plain-ASCII path for files the video uploads (the browser rejects some characters in paths). */
export function filePath(name: string) {
  const dir = path.resolve("walkthrough-output/files");
  mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}

export async function pause(page: Page, ms = 1200) {
  await page.waitForTimeout(ms);
}

/** JSON API call from a signed-in page (same origin, like the app). */
export async function api<T = unknown>(page: Page, method: string, url: string, data?: unknown): Promise<T> {
  const origin = new URL(page.url()).origin;
  const res = await page.request.fetch(url, { method, data, headers: { Origin: origin, "Content-Type": "application/json" } });
  const json = (await res.json()) as { ok: boolean; data: T; error?: { message: string } };
  if (!json.ok) throw new Error(`${method} ${url} → ${res.status()}: ${json.error?.message}`);
  return json.data;
}

/** Sign in through the real form, including the secret-key step when the account has one. */
export async function signIn(page: Page, who: Account, where: "/admin" | "/login" = "/login") {
  await page.goto(where);
  await type(page.locator("#username"), who.username);
  await type(page.locator("#password"), who.password);
  await tap(page.locator("button[type=submit]"));
  if (who.secret) {
    await page.locator("#secret-key").waitFor();
    await type(page.locator("#secret-key"), who.secret);
    await tap(page.getByRole("button", { name: "Verify and sign in" }));
  }
  await page.waitForURL((u) => !/\/(login|admin)$/.test(u.pathname), { timeout: 30_000 });
}

/** A second recorded browser window (e.g. the manager approving on another device). */
export async function newRecordedPage(browser: Browser, opts: { mobile?: boolean } = {}) {
  const info = test.info();
  const size = opts.mobile ? { width: 412, height: 915 } : { width: 1280, height: 720 };
  const ctx = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: size,
    recordVideo: { dir: info.outputPath("second-window"), size },
  });
  await prepareContext(ctx);
  const page = await ctx.newPage();
  page.on("dialog", (d) => void d.accept());
  return page;
}

/** Record every page of the default context with the overlay. */
export function setup() {
  test.beforeEach(async ({ context, page }) => {
    await prepareContext(context);
    // Confirmation prompts ("Import 3 products?", "Deactivate…?") are accepted, as a user would.
    page.on("dialog", (d) => void d.accept());
  });
  // A step that throws (not a check) ends the video early: record that as a failure too.
  test.afterEach(async ({ page }, info) => {
    const rec = recorders.get(page) ?? current;
    if (!rec || rec.finished) return;
    rec.checks.push({ label: "Video could not continue", ok: false, error: (info.error?.message ?? "stopped").split("\n")[0].slice(0, 400), page: page.url() });
    writeResults(rec);
  });
}

function writeResults(rec: Recorder) {
  const info = test.info();
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(
    path.join(RESULTS_DIR, `${rec.video}.json`),
    JSON.stringify({ video: rec.video, title: rec.area, project: info.project.name, outputDir: info.outputDir, checks: rec.checks }, null, 2),
  );
}

/** Wait until the page has loaded and React has attached its event handlers. */
export async function ready(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(300);
}

/** "₹8,096.00" → 8096 */
export function inr(text: string | null | undefined) {
  return Number((text ?? "").replace(/[^\d.]/g, ""));
}

/** Start a new POS sale and add an item by searching. */
export async function newSaleWith(page: Page, search: string, sku: string, qty = "1", unitStartsWith?: string) {
  await page.goto("/pos");
  await tap(page.getByTestId("new-sale"));
  await page.waitForURL(/\/pos\/sale\/[0-9a-f-]{36}$/);
  await type(page.locator("#pos-search"), search);
  await tap(page.getByRole("option").filter({ hasText: sku }));
  if (unitStartsWith) {
    const unit = page.locator("#add-unit");
    const label = (await unit.locator("option").allTextContents()).find((o) => o.startsWith(unitStartsWith))!;
    await unit.selectOption({ label });
  }
  await type(page.locator("#add-qty"), qty);
  await tap(page.getByRole("button", { name: "Add to cart" }));
  await page.getByRole("region", { name: "Cart" }).getByText(sku).waitFor();
  return (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
}

/**
 * Finalise the current POS sale (customer agrees the amount) and get through the customer step that
 * comes before payment: with `customer`, their details are typed; without, the sale is a walk-in.
 */
export async function agree(page: Page, customer: { name: string; mobile: string; email?: string } | null = null) {
  await tap(page.getByTestId("finalize"));
  await tap(page.getByRole("button", { name: /Customer agrees/ }));
  await page.getByRole("region", { name: "Customer details" }).waitFor();
  if (customer) {
    await type(page.locator("#c-name"), customer.name);
    await type(page.locator("#c-mobile"), customer.mobile);
    if (customer.email) await type(page.locator("#c-email"), customer.email);
    await tap(page.getByRole("button", { name: "Continue to payment" }));
  } else {
    await tap(page.getByRole("button", { name: "Walk-in — no details" }));
  }
  await page.getByTestId("amount-due").waitFor();
}

/** Record cash for the whole amount due on the current POS sale. */
export async function payCash(page: Page, tendered?: string) {
  await tap(page.getByRole("button", { name: /Record cash, card, bank transfer/ }));
  if (tendered) await type(page.locator("#pay-tendered"), tendered);
  await page.getByTestId("confirm-received").check();
  await tap(page.getByRole("button", { name: /^Confirm .* received$/ }));
}

/** No sideways scrolling (phone layouts). */
export async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}
