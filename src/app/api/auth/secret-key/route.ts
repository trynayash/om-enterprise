import { z } from "zod";
import { api } from "@/server/http";
import { removeLoginSecret, setLoginSecret } from "@/server/services/auth";
import { SESSION_COOKIE } from "@/server/auth/session";

const setBody = z.object({
  currentPassword: z.string().min(1).max(200),
  currentSecretKey: z.string().max(200).nullable().optional(),
  newSecretKey: z.string().min(1).max(200),
});
const removeBody = z.object({ currentPassword: z.string().min(1).max(200), currentSecretKey: z.string().min(1).max(200) });

/** Add or change your own sign-in secret key. */
export const POST = api({}, async ({ actor, body, req }) => {
  await setLoginSecret(actor, await body(setBody), req.cookies.get(SESSION_COOKIE)?.value);
  return { hasSecretKey: true };
});

/** Remove your own sign-in secret key. */
export const DELETE = api({}, async ({ actor, body }) => {
  await removeLoginSecret(actor, await body(removeBody));
  return { hasSecretKey: false };
});
