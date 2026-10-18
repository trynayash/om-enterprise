/**
 * Rebuild the e2e database (E2E_DATABASE_URL) from migrations, configure realistic settings,
 * create the e2e owner account and load SAMPLE products. Run by `npm run test:e2e`.
 */
import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { execFileSync } from "node:child_process";
import * as schema from "../src/server/db/schema";
import { bootstrap } from "../src/server/bootstrap";

export const E2E_OWNER = { username: "e2e.owner", password: "E2e-Owner-Pass-2026!" };

async function main() {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set");
  if (url === process.env.DATABASE_URL) throw new Error("E2E_DATABASE_URL must differ from DATABASE_URL");
  const pool = new Pool({ connectionString: url, max: 2 });
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  await bootstrap(db);
  await pool.end();

  const env = { ...process.env, DATABASE_URL: url };
  const tsx = ["tsx", "--conditions=react-server"];
  execFileSync("npx", [...tsx, "scripts/create-super-admin.ts"], {
    env: { ...env, SA_USERNAME: E2E_OWNER.username, SA_NAME: "E2E Owner", SA_PASSWORD: E2E_OWNER.password },
    stdio: "inherit",
  });
  execFileSync("npx", [...tsx, "scripts/seed-demo.ts"], { env, stdio: "inherit" });
  execFileSync("npx", [...tsx, "scripts/e2e-settings.ts"], { env, stdio: "inherit" });
  console.log("e2e database ready");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
