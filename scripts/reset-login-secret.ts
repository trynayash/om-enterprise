/**
 * Recovery: remove a forgotten sign-in secret key, e.g. the Super Admin's own.
 * Needs direct access to the server/database, which is the right trust boundary for this.
 *
 *   npm run reset-login-secret -- Kishan
 *
 * The account's sessions are signed out; the user can add a new key at Account → Security.
 */
import "dotenv/config";

async function main() {
  const username = process.argv[2]?.trim();
  if (!username) throw new Error("Usage: npm run reset-login-secret -- <username>");
  const { sql, eq } = await import("drizzle-orm");
  const { getDb, getPool } = await import("../src/server/db/client");
  const { loginChallenges, users } = await import("../src/server/db/schema");
  const { audit } = await import("../src/server/audit");
  const { revokeUserSessions } = await import("../src/server/services/auth");
  const db = getDb();
  await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(sql`lower(${users.username}) = lower(${username})`);
    if (!user) throw new Error(`No account named "${username}"`);
    if (!user.loginSecretHash) throw new Error(`"${user.username}" has no secret key`);
    await tx.update(users).set({ loginSecretHash: null, loginSecretSetAt: null, updatedAt: new Date() }).where(eq(users.id, user.id));
    await tx.delete(loginChallenges).where(eq(loginChallenges.userId, user.id));
    await revokeUserSessions(tx, user.id);
    await audit(tx, { userId: null, label: "cli:reset-login-secret" }, {
      action: "auth.secret_key_cleared",
      entityType: "user",
      entityId: user.id,
      summary: `Removed the sign-in secret key of ${user.displayName} via command line (sessions signed out)`,
    });
  });
  console.log(`Secret key removed for "${username}". Sign in with the password, then add a new key at Account → Security.`);
  await getPool().end();
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
