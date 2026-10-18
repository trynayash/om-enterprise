import { OWNER, YASH, api, check, expect, finish, say, setup, signIn, tap, test, titleCard, type } from "./kit";

setup();

test("23 · Secret keys for staff: add, use, and the owner clears a forgotten key", async ({ page }) => {
  await signIn(page, YASH);
  await page.goto("/account/security");
  await titleCard(page, "23", "Secret key for any account", "Yash adds his own secret key. Later he forgets it — Kishan clears it from Staff & access, and Yash can sign in with his password again and set a new one.");
  await say(page, "Yash adds a secret key from the menu (Secret key).");
  await type(page.locator("#sk-password"), YASH.password);
  await type(page.locator("#sk-new"), "Teal-Key-5521");
  await type(page.locator("#sk-confirm"), "Teal-Key-5521");
  await tap(page.getByRole("button", { name: "Add secret key" }));
  await check(page, "Yash's secret key saved", () => expect(page.getByText(/Secret key added/)).toBeVisible());
  await api(page, "POST", "/api/auth/logout", {});
  await say(page, "Next sign-in asks for it.");
  await page.goto("/login");
  await type(page.locator("#username"), YASH.username);
  await type(page.locator("#password"), YASH.password);
  await tap(page.locator("button[type=submit]"));
  await check(page, "Secret key step appears for Yash", () => expect(page.locator("#secret-key")).toBeVisible());

  await say(page, "Yash has forgotten it. Kishan clears it in Staff & access.");
  await signIn(page, OWNER, "/admin");
  await page.goto("/dashboard/staff");
  const row = page.getByRole("row").filter({ hasText: `@${YASH.username}` });
  await check(page, "Yash shows the 'Secret key' badge", () => expect(row.getByText("Secret key")).toBeVisible());
  await tap(row.getByRole("button", { name: "Clear forgotten secret key" }));
  await check(page, "Cleared", () => expect(row.getByText("Secret key")).toHaveCount(0));
  await api(page, "POST", "/api/auth/logout", {});
  await say(page, "Yash signs in with just his password again.");
  await signIn(page, YASH);
  await check(page, "Yash is in", () => expect(page).toHaveURL(/\/dashboard/));
  await finish(page);
});
