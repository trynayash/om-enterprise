import { OWNER, SACHIN, VIKRAM, YASH, check, expect, finish, pause, say, setup, signIn, tap, test, titleCard, type } from "./kit";

setup();

test("04 · Staff accounts, roles and individual permissions", async ({ page }) => {
  await signIn(page, OWNER, "/admin");
  await page.goto("/dashboard/staff");
  await titleCard(page, "04", "Staff & access", "Kishan creates accounts for Yash and Vikram Uncle (Admins) and Sachin (Sales), each with a temporary password, then adjusts one person's permissions.");

  for (const s of [YASH, VIKRAM, SACHIN]) {
    await say(page, `Add ${s.name} as ${s.role === "sales" ? "Sales & Operations" : "Admin"}, with a temporary password.`);
    if (await page.getByText(`@${s.username}`, { exact: true }).count()) continue; // re-run on an existing database
    await tap(page.getByRole("button", { name: "Add staff member" }));
    const d = page.locator("dialog[open]");
    await type(d.getByLabel("Full name"), s.name);
    await type(d.getByLabel("Username"), s.username);
    await d.getByLabel("Role").selectOption(s.role);
    await type(d.getByLabel("Temporary password"), s.temp);
    await tap(d.getByRole("button", { name: "Create account" }));
    await check(page, `${s.name}'s account created`, () => expect(page.getByText(`@${s.username}`, { exact: true })).toBeVisible());
  }
  await check(page, "New accounts must set their own password", () => expect(page.getByText("Must set password").filter({ visible: true }).first()).toBeVisible());

  await say(page, "Admins get no automatic financial or security powers. For Vikram Uncle, Kishan also denies seeing purchase costs.");
  const row = page.getByRole("row").filter({ hasText: VIKRAM.username });
  await tap(row.getByRole("button", { name: "Individual permissions" }));
  const perms = page.locator("dialog[open]");
  const costRow = perms.getByText("costs.view · role default: yes").locator("xpath=../..");
  await costRow.getByRole("combobox").selectOption("deny");
  await pause(page, 800);
  await tap(perms.getByRole("button", { name: "Save permissions" }));
  await check(page, "Vikram's individual permission saved", () => expect(perms).toBeHidden());

  await say(page, "Roles show their default permissions and discount limits (Admin 10%, Sales 5%).");
  await page.getByRole("heading", { name: "Roles" }).scrollIntoViewIfNeeded();
  await check(page, "Roles listed", () => expect(page.getByText("Sales & Operations").filter({ visible: true }).first()).toBeVisible());
  await pause(page, 1500);
  await say(page, "The Super Admin's own row can't be changed from here — he is protected from deactivation.");
  await check(page, "Owner's row is protected", () =>
    expect(page.getByRole("row").filter({ hasText: OWNER.username }).getByText(/Use “Change password”|Super Admin only/)).toBeVisible(),
  );
  await finish(page);
});
