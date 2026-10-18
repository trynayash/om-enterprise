/** e2e only: regular GST with a checksum-valid TEST GSTIN, and UPI QR enabled with a test UPI ID. */
import "dotenv/config";

async function main() {
  const { getDb, getPool } = await import("../src/server/db/client");
  const { getSettings, saveSettings } = await import("../src/server/settings");
  const { gstinCheckChar } = await import("../src/lib/india");
  const actor = { userId: null, label: "e2e-setup" };
  const base = "24ABCDE1234F1Z";
  await getDb().transaction(async (tx) => {
    const business = await getSettings("business", tx);
    await saveSettings(tx, actor, "business", { ...business, gstin: `${base}${gstinCheckChar(base)}` });
    const tax = await getSettings("tax", tx);
    await saveSettings(tx, actor, "tax", { ...tax, registrationType: "regular", confirmedBy: "E2E test only" });
    const payments = await getSettings("payments", tx);
    await saveSettings(tx, actor, "payments", { ...payments, upiEnabled: true, upiVpa: "omenterprise.test@okaxis" });
  });
  await getPool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
