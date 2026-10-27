import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/server/http";
import { loginWithPin } from "@/server/services/auth";
import { publicActor } from "@/server/auth/actor";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";

const body = z.object({ username: z.string().trim().min(1).max(60), pin: z.string().trim().min(1).max(12) });

/** Counter staff: username + PIN instead of the password. */
export const POST = api({ public: true }, async (ctx) => {
  const { username, pin } = await ctx.body(body);
  const result = await loginWithPin(username, pin, ctx.client);
  const res = NextResponse.json({ ok: true, data: { actor: publicActor(result.actor) } }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt));
  return res;
});
