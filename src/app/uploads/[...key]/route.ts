import type { NextRequest } from "next/server";
import { readObject } from "@/server/services/uploads";

/** Public product images (re-encoded WebP; no user-controlled content types). */
export async function GET(_req: NextRequest, ctx: RouteContext<"/uploads/[...key]">) {
  const { key } = await ctx.params;
  const data = await readObject(key.join("/"));
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
