import { z } from "zod";
import { api } from "@/server/http";
import { changePassword } from "@/server/services/auth";
import { SESSION_COOKIE } from "@/server/auth/session";

const body = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) });

export const POST = api({ allowPasswordChangePending: true }, async ({ actor, body: parse, req }) => {
  const { currentPassword, newPassword } = await parse(body);
  await changePassword(actor, currentPassword, newPassword, req.cookies.get(SESSION_COOKIE)?.value);
  return { changed: true };
});
