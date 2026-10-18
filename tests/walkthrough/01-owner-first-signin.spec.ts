import { OWNER, api, check, expect, finish, say, setup, tap, test, titleCard, type } from "./kit";

setup();

test("01 · Owner's first sign-in at /admin, own password and secret key", async ({ page }) => {
  await page.goto("/admin");
  await titleCard(page, "01", "Owner's first sign-in", "Kishan opens /admin with the one-time password from the handover note, is made to choose his own password, then adds a secret key.");

  await say(page, "The owner's sign-in page is /admin.");
  await check(page, "/admin shows the Admin sign-in form", () => expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible());

  await say(page, "A wrong password is refused with a general message that doesn't reveal whether the username exists.");
  await type(page.locator("#username"), OWNER.username);
  await type(page.locator("#password"), "Wrong-Password-1");
  await tap(page.locator("button[type=submit]"));
  await check(page, "Wrong password refused", () => expect(page.getByText("Invalid username or password")).toBeVisible());

  await say(page, "Now the one-time password from the handover note.");
  await type(page.locator("#password"), OWNER.temp);
  await tap(page.locator("button[type=submit]"));
  await page.waitForURL(/\/account\/password/);
  await check(page, "First sign-in forces a password change", () => expect(page.getByRole("heading", { name: "Set your own password" })).toBeVisible());

  await say(page, "Until the password is changed nothing else opens — even the dashboard sends him back here.");
  await page.goto("/dashboard");
  await page.waitForURL(/\/account\/password/);
  await check(page, "Dashboard is blocked until the password is changed", () => expect(page).toHaveURL(/\/account\/password/));

  await say(page, "He chooses his own password (the owner's must be at least 12 characters).");
  await type(page.locator("#cur"), OWNER.temp);
  await type(page.locator("#new"), OWNER.password);
  await type(page.locator("#conf"), OWNER.password);
  await tap(page.getByRole("button", { name: "Save new password" }));
  await page.waitForURL(/\/account\/security\?setup=1/);
  await check(page, "Next, he is offered a secret key", () => expect(page.getByRole("heading", { name: /Protect your account/ })).toBeVisible());

  await say(page, "He adds a secret key: asked after the password at every sign-in.");
  await type(page.locator("#sk-password"), OWNER.password);
  await type(page.locator("#sk-new"), OWNER.secret);
  await type(page.locator("#sk-confirm"), OWNER.secret);
  await tap(page.getByRole("button", { name: "Add secret key" }));
  await check(page, "Secret key saved", () => expect(page.getByText(/Secret key added/)).toBeVisible());
  await page.waitForURL(/\/dashboard$/);
  await check(page, "Lands on the owner dashboard", () => expect(page.getByRole("heading", { level: 1 })).toBeVisible());

  await say(page, "Sign out, then sign in again at /admin with username and password…");
  await api(page, "POST", "/api/auth/logout", {});
  await page.goto("/admin");
  await type(page.locator("#username"), OWNER.username);
  await type(page.locator("#password"), OWNER.password);
  await tap(page.locator("button[type=submit]"));
  await check(page, "After a correct password, the secret key is asked", () => expect(page.locator("#secret-key")).toBeVisible());

  await say(page, "A wrong secret key is refused, and no session is created.");
  await type(page.locator("#secret-key"), "Wrong-Key-0000");
  await tap(page.getByRole("button", { name: "Verify and sign in" }));
  await check(page, "Wrong secret key refused", () => expect(page.getByText("Secret key is incorrect")).toBeVisible());
  await check(page, "Still signed out after a wrong key", async () => expect((await page.request.get("/api/auth/me")).status()).toBe(401));

  await say(page, "With the right key he is in.");
  await type(page.locator("#secret-key"), OWNER.secret);
  await tap(page.getByRole("button", { name: "Verify and sign in" }));
  await page.waitForURL(/\/dashboard$/);
  await check(page, "Signed in with password + secret key", () => expect(page).toHaveURL(/\/dashboard$/));

  await say(page, "The one-time handover password no longer works.");
  await check(page, "Old one-time password rejected", async () => {
    const r = await page.request.post("/api/auth/login", { data: { username: OWNER.username, password: OWNER.temp }, headers: { Origin: new URL(page.url()).origin } });
    expect(r.status()).toBe(401);
  });
  await say(page, "Visiting /admin while signed in goes straight to the dashboard.");
  await page.goto("/admin");
  await page.waitForURL(/\/dashboard$/);
  await check(page, "/admin skips the form when already signed in", () => expect(page).toHaveURL(/\/dashboard$/));
  await finish(page);
});
