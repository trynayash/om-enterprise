/**
 * Recovery of a forgotten Super Admin password on a hosted deployment (Vercel), where there is no
 * command line. It runs on every deploy (see `vercel-build`) and does nothing unless these are set in
 * the project's environment variables:
 *
 *   SA_RESET_USERNAME             the Super Admin's username, e.g. Kishan
 *   SA_RESET_PASSWORD             a new temporary password (12+ characters, letters and numbers or symbols)
 *   SA_RESET_CLEAR_SECRET_KEY     "true" to also remove a forgotten sign-in secret key
 *
 * The next deploy sets that temporary password, unlocks the account and signs its sessions out. Sign in
 * at /admin with it and choose a new password. It applies once per password given; remove the variables
 * afterwards. A problem here is reported in the build log but never stops the deploy.
 */
import "dotenv/config";

async function main() {
  const username = process.env.SA_RESET_USERNAME?.trim();
  const password = process.env.SA_RESET_PASSWORD ?? "";
  if (!username && !password) {
    console.log("Owner password reset: not requested.");
    return;
  }
  const { getPool } = await import("../src/server/db/client");
  try {
    if (!username || !password) throw new Error("Set both SA_RESET_USERNAME and SA_RESET_PASSWORD.");
    const { resetOwnerPassword } = await import("../src/server/services/users");
    const r = await resetOwnerPassword({ username, password, clearSecretKey: process.env.SA_RESET_CLEAR_SECRET_KEY === "true" });
    if (r.status === "already_applied") {
      console.log(`Owner password reset: already applied for "${username}". Remove SA_RESET_USERNAME, SA_RESET_PASSWORD and SA_RESET_CLEAR_SECRET_KEY from the project settings.`);
    } else {
      console.log(
        `Owner password reset: applied for "${username}"${r.clearedSecretKey ? " (secret key removed)" : ""}. Sign in at /admin with the temporary password and choose a new one. Remove the SA_RESET_* variables now.`,
      );
    }
  } catch (err) {
    console.error(`Owner password reset NOT applied: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await getPool().end();
  }
}

main().catch((err) => {
  console.error(`Owner password reset NOT applied: ${err instanceof Error ? err.message : String(err)}`);
});
