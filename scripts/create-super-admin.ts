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
