import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { actorFromRequest, clientInfoFromHeaders } from "@/server/auth/session";
import { requirePermission, type Actor } from "@/server/auth/actor";
import { AppError, invalid, toAppError } from "@/server/errors";
import type { Permission } from "@/lib/permissions";

export interface ApiContext {
  req: NextRequest;
  actor: Actor | null;
  params: Record<string, string>;
  client: { ip: string; userAgent: string };
  /** Parse and validate the JSON body. */
  body<S extends z.ZodType>(schema: S): Promise<z.infer<S>>;
  query: URLSearchParams;
}

export interface AuthedContext extends ApiContext {
  actor: Actor;
}

interface Options {
  /** No session required (public website endpoints). */
  public?: boolean;
  /** Required permission(s) — any of. */
  permission?: Permission | Permission[];
  /** Skip same-origin check (signed webhooks only). */
  webhook?: boolean;
  /** Allow even when the user must change their password. */
  allowPasswordChangePending?: boolean;
  /** Override the default 256 KB JSON body limit (e.g. CSV import). */
  maxBodyBytes?: number;
}

type RouteCtx = { params: Promise<Record<string, string | string[]>> };

const MAX_BODY_BYTES = 256 * 1024;

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Browsers always send Origin on cross-site POST/PUT/PATCH/DELETE. Absent Origin = same-origin
    // navigation or non-browser client; fall back to Sec-Fetch-Site when present.
    const site = req.headers.get("sec-fetch-site");
    return !site || site === "same-origin" || site === "none";
  }
  const allowed = new Set<string>();
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }
  if (process.env.APP_BASE_URL) allowed.add(new URL(process.env.APP_BASE_URL).origin);
  return allowed.has(origin);
}

export function jsonError(err: AppError) {
  return NextResponse.json(
    { ok: false, error: { code: err.code, message: err.message, details: err.details ?? null } },
    { status: err.status, headers: { "Cache-Control": "no-store" } },
  );
}

export function api<O extends Options>(
  opts: O,
  handler: (ctx: O["public"] extends true ? ApiContext : AuthedContext) => Promise<unknown>,
) {
  return async (req: NextRequest, routeCtx: RouteCtx): Promise<Response> => {
    try {
      const method = req.method.toUpperCase();
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(method);
      if (mutating && !opts.webhook && !sameOrigin(req)) {
        throw new AppError("FORBIDDEN", "Cross-site request blocked");
      }
      const client = clientInfoFromHeaders(req.headers);
      const rawParams = routeCtx?.params ? await routeCtx.params : {};
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawParams)) params[k] = Array.isArray(v) ? v.join("/") : v;

      let actor: Actor | null = null;
      if (!opts.public) {
        actor = await actorFromRequest(req);
        if (!actor) throw new AppError("UNAUTHENTICATED", "Your session has ended. Please sign in again.");
        if (actor.mustChangePassword && !opts.allowPasswordChangePending) {
          throw new AppError("PRECONDITION", "Please change your password before continuing", { mustChangePassword: true });
        }
        if (opts.permission) requirePermission(actor, opts.permission);
      }

      const ctx: ApiContext = {
        req,
        actor,
        params,
        client,
        query: req.nextUrl.searchParams,
        async body(schema) {
          if (mutating) {
            const ct = req.headers.get("content-type") ?? "";
            if (!ct.includes("application/json")) throw invalid("Expected a JSON request body");
          }
          const text = await req.text();
          if (text.length > (opts.maxBodyBytes ?? MAX_BODY_BYTES)) throw invalid("Request body is too large");
          let json: unknown;
          try {
            json = text ? JSON.parse(text) : {};
          } catch {
            throw invalid("Malformed JSON");
          }
          const parsed = schema.safeParse(json);
          if (!parsed.success) {
            const first = parsed.error.issues[0];
            const where = first?.path?.length ? `${first.path.join(".")}: ` : "";
            throw invalid(`${where}${first?.message ?? "Invalid input"}`, { issues: parsed.error.issues });
          }
          return parsed.data;
        },
      };

      const result = await handler(ctx as never);
      if (result instanceof Response) return result;
      return NextResponse.json({ ok: true, data: result ?? null }, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      const appErr = toAppError(err);
      if (appErr.code === "INTERNAL") console.error("[api]", req.method, req.nextUrl.pathname, err);
      return jsonError(appErr);
    }
  };
}
