/**
 * Create the first Super Admin account (there is NO default administrator password).
 *
 *   npm run create-super-admin
 *
 * Non-interactive (e.g. first deploy) — values are read from the environment and never logged:
 *   SA_USERNAME=Kishan SA_NAME="Kishan Suthar" SA_PASSWORD='…' npm run create-super-admin
 * A password given this way is TEMPORARY: it must be changed at the first sign-in (at /admin).
 * Set SA_TEMPORARY=false only for automated test fixtures.
 *
 * Refuses to run if a Super Admin already exists (pass --additional to add another one deliberately).
 * With --if-missing (hosted builds) it never prompts: it does nothing when a Super Admin exists or
 * when SA_USERNAME / SA_PASSWORD are not set, so it is safe to run on every deploy.
 */
import "dotenv/config";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

async function ask(question: string, hidden = false): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
    muted = hidden;
  });
}

async function main() {
  const { createInitialSuperAdmin } = await import("../src/server/services/users");
  const { getPool } = await import("../src/server/db/client");
  const additional = process.argv.includes("--additional");

  if (process.argv.includes("--if-missing")) {
    const { getDb } = await import("../src/server/db/client");
    const { roles, users } = await import("../src/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const existing = await getDb().select({ id: users.id }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(roles.key, "super_admin")).limit(1);
    const skip = existing.length
      ? "A Super Admin already exists; nothing to do."
      : !process.env.SA_USERNAME || !process.env.SA_PASSWORD
        ? "No Super Admin yet. Set SA_USERNAME, SA_NAME and SA_PASSWORD to create one (skipped)."
        : null;
    if (skip) {
      console.log(skip);
      await getPool().end();
      return;
    }
  }

  const username = process.env.SA_USERNAME || (await ask("Username (e.g. kishan): "));
  const displayName = process.env.SA_NAME || (await ask("Full name (e.g. Kishan Suthar): "));
  let password = process.env.SA_PASSWORD ?? "";
  // A password that travelled through the environment (or a handover note) is temporary.
  const temporary = password ? process.env.SA_TEMPORARY !== "false" : false;
  if (!password) {
    password = await ask("Password (min 12 chars, hidden): ", true);
    const confirm = await ask("Confirm password: ", true);
    if (password !== confirm) throw new Error("Passwords do not match");
  }
  const mobile = process.env.SA_MOBILE || undefined;
  const email = process.env.SA_EMAIL || undefined;

  const u = await createInitialSuperAdmin({ username, displayName, password, mobile, email, allowAdditional: additional, temporary });
  console.log(
    `Super Admin "${username}" created (id ${u.id}). Sign in at /admin${temporary ? " — the password must be changed at the first sign-in" : ""}.`,
  );
  await getPool().end();
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
