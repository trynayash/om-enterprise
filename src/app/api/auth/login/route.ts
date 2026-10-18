import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/server/http";
import { login } from "@/server/services/auth";
import { publicActor } from "@/server/auth/actor";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";

const body = z.object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(200) });

/** Step 1: username + password. Accounts with a secret key get a challenge for step 2 instead of a session. */
export const POST = api({ public: true }, async (ctx) => {
  const { username, password } = await ctx.body(body);
  const result = await login(username, password, ctx.client);
  if (result.kind === "secret_required") {
    return NextResponse.json(
      { ok: true, data: { secretKeyRequired: true, challenge: result.challenge, expiresAt: result.expiresAt.toISOString() } },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const res = NextResponse.json({ ok: true, data: { actor: publicActor(result.actor) } }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt));
  return res;
});
