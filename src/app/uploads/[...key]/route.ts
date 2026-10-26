import type { NextRequest } from "next/server";
import { readObject } from "@/server/services/uploads";

/** Public product images (re-encoded WebP; no user-controlled content types). */
export async function GET(req: NextRequest, ctx: RouteContext<"/uploads/[...key]">) {
  const { key } = await ctx.params;
  let data: Buffer | null;
  try {
    data = await readObject(key.join("/"));
  } catch (err) {
    // The image store is briefly unreachable: say so (and don't let a cache keep it) so the browser tries again.
    console.error("[uploads]", req.nextUrl.pathname, err);
    return new Response("Temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" } });
  }
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
