import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/server/http";
import { login } from "@/server/services/auth";
import { publicActor } from "@/server/auth/actor";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";

const body = z.object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(200) });

export const POST = api({ public: true }, async (ctx) => {
  const { username, password } = await ctx.body(body);
  const { token, expiresAt, actor } = await login(username, password, ctx.client);
  const res = NextResponse.json({ ok: true, data: { actor: publicActor(actor) } }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return res;
});
