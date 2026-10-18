import { api } from "@/server/http";
import { clearLoginSecretFor } from "@/server/services/auth";

/** Super Admin: clear a staff member's forgotten secret key. */
export const DELETE = api({ permission: "users.manage" }, async ({ actor, params }) => {
  await clearLoginSecretFor(actor, params.id);
  return { cleared: true };
});
