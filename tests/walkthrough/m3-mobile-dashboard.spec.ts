import { OWNER, check, expect, finish, noSideScroll, pause, say, setup, signIn, tap, test, titleCard } from "./kit";

setup();

test("M3 · Owner's dashboard on a phone", async ({ page }) => {
  await page.goto("/admin");
  await titleCard(page, "M3", "Dashboard on a phone", "Kishan checks the shop from his phone: sign-in with secret key, today's figures, approvals and reports.");
  await say(page, "Sign in at /admin with password and secret key.");
  await signIn(page, OWNER, "/admin");
  await check(page, "Dashboard on the phone", () => expect(page.getByRole("region", { name: "Today" })).toBeVisible());
  await check(page, "Fits the screen", () => noSideScroll(page));
  await page.mouse.wheel(0, 700);
  await pause(page, 1500);
  await say(page, "The menu.");
  await tap(page.getByRole("button", { name: "Open menu" }));
  await pause(page, 1200);
  await tap(page.getByRole("link", { name: "Reports" }).filter({ visible: true }).first());
  await page.waitForURL(/\/dashboard\/reports/);
  await check(page, "Reports on the phone", () => expect(page.getByRole("heading", { name: "Reports" })).toBeVisible());
  await check(page, "Reports fit the screen", () => noSideScroll(page));
  await finish(page);
});
