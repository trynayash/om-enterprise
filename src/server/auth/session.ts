import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection, type NextRequest } from "next/server";
import { actorFromToken } from "@/server/services/auth";
import { can, type Actor } from "@/server/auth/actor";
import type { Permission } from "@/lib/permissions";

const secure = process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true";
/** `__Host-` prefix: browser enforces Secure, Path=/ and no Domain (can't be set by subdomains). */
export const SESSION_COOKIE = secure ? "__Host-om_session" : "om_session";

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export function clientInfoFromHeaders(h: Headers) {
  // Behind N trusted reverse proxies the client's address is the Nth X-Forwarded-For entry from the
  // right; anything further left was sent by the client itself and can be forged.
  const hops = process.env.TRUST_PROXY === "false" ? 0 : Math.max(1, Math.floor(Number(process.env.TRUST_PROXY_HOPS ?? 1)) || 1);
  const chain = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const fwd = hops > 0 && chain.length ? chain[Math.max(0, chain.length - hops)] : undefined;
  return {
    ip: fwd || h.get("x-real-ip") || "unknown",
    userAgent: h.get("user-agent") ?? "",
  };
}

/** Current staff member for Server Components (memoised per request). */
export const getCurrentActor = cache(async (): Promise<Actor | null> => {
  // Session checks depend on the current time: always evaluate at request time.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return actorFromToken(token, clientInfoFromHeaders(await headers()));
});

/** For pages: redirect to login if signed out; to /account/password if a change is required. */
export async function requirePageActor(permission?: Permission | Permission[]): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.mustChangePassword) redirect("/account/password?required=1");
  if (permission) {
    const list = Array.isArray(permission) ? permission : [permission];
    if (!list.some((p) => can(actor, p))) redirect("/dashboard/forbidden");
  }
  return actor;
}

export async function actorFromRequest(req: NextRequest): Promise<Actor | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return actorFromToken(token, clientInfoFromHeaders(req.headers));
}
