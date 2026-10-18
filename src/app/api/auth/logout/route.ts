import { NextResponse } from "next/server";
import { api } from "@/server/http";
import { actorFromToken, logout } from "@/server/services/auth";
import { SESSION_COOKIE } from "@/server/auth/session";

export const POST = api({ public: true }, async ({ req, client }) => {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await logout(token, await actorFromToken(token, client));
  const res = NextResponse.json({ ok: true, data: null });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
