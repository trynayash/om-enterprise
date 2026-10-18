/**
 * Apply database migrations, then idempotent reference data.
 *   npm run db:migrate
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "../src/server/db/schema";
import { bootstrap } from "../src/server/bootstrap";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 2 });
  try {
    const db = drizzle(pool, { schema });
    console.log("Applying migrations…");
    await migrate(db, { migrationsFolder: "drizzle" });
    console.log("Bootstrapping reference data…");
    const { created } = await bootstrap(db);
    console.log(created.length ? `Created: ${created.join(", ")}` : "Reference data already present.");
    console.log("Done.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
