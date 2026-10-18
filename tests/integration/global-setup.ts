/**
 * Integration tests run against a REAL PostgreSQL database (TEST_DATABASE_URL), rebuilt from
 * the migrations on every run — so the integrity triggers are exercised exactly as in production.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "../../src/server/db/schema";
import { bootstrap } from "../../src/server/bootstrap";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL must be set for integration tests");
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL (it is wiped)");
  const pool = new Pool({ connectionString: url, max: 2 });
  try {
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
    await bootstrap(db);
  } finally {
    await pool.end();
  }
}
