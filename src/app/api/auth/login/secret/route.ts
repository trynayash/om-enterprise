import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/server/http";
import { completeSecretLogin } from "@/server/services/auth";
import { publicActor } from "@/server/auth/actor";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";

const body = z.object({ challenge: z.string().min(1).max(100), secretKey: z.string().min(1).max(200) });

/** Step 2: the secret key, for accounts that have one. */
export const POST = api({ public: true }, async (ctx) => {
  const { challenge, secretKey } = await ctx.body(body);
  const { token, expiresAt, actor } = await completeSecretLogin(challenge, secretKey, ctx.client);
  const res = NextResponse.json({ ok: true, data: { actor: publicActor(actor) } }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return res;
});
