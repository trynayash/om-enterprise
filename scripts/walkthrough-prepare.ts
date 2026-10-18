/**
 * Rebuild the throwaway e2e database for the recorded walkthrough (`npm run walkthrough`):
 * migrations, the owner "Kishan" created exactly like the handover note (temporary password that
 * must be changed at first sign-in), SAMPLE products, and test GST/UPI settings.
 * The password here is a DEMO value for recordings only — never the real handover password.
 */
import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { execFileSync } from "node:child_process";
import * as schema from "../src/server/db/schema";
import { bootstrap } from "../src/server/bootstrap";

export const WALKTHROUGH_OWNER = { username: "Kishan", name: "Kishan Suthar", tempPassword: "Walkthrough-Temp-2026" };

async function main() {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set");
  if (url === process.env.DATABASE_URL) throw new Error("E2E_DATABASE_URL must differ from DATABASE_URL");
  const pool = new Pool({ connectionString: url, max: 2 });
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await migrate(drizzle(pool, { schema }), { migrationsFolder: "drizzle" });
  await bootstrap(drizzle(pool, { schema }));
  await pool.end();

  const env = { ...process.env, DATABASE_URL: url };
  const tsx = ["tsx", "--conditions=react-server"];
  execFileSync("npx", [...tsx, "scripts/create-super-admin.ts"], {
    env: { ...env, SA_USERNAME: WALKTHROUGH_OWNER.username, SA_NAME: WALKTHROUGH_OWNER.name, SA_PASSWORD: WALKTHROUGH_OWNER.tempPassword },
    stdio: "inherit",
  });
  execFileSync("npx", [...tsx, "scripts/seed-demo.ts"], { env, stdio: "inherit" });
  execFileSync("npx", [...tsx, "scripts/e2e-settings.ts"], { env, stdio: "inherit" });
  console.log("walkthrough database ready");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
