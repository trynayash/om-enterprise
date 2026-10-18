import type { NextRequest } from "next/server";
import { handleGatewayWebhook } from "@/server/services/payments";

/**
 * Payment gateway webhooks. Authenticated by the provider's HMAC signature over the RAW body
 * (never re-serialised). Idempotent: each provider event id is processed at most once.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/payments/webhook/[provider]">) {
  const { provider } = await ctx.params;
  const raw = await req.text();
  if (raw.length > 512 * 1024) return new Response("too large", { status: 413 });
  try {
    const { outcome, status } = await handleGatewayWebhook(provider, raw, req.headers);
    return Response.json({ outcome }, { status });
  } catch (err) {
    console.error("[webhook]", provider, err);
    // 5xx makes the provider retry later; processing is idempotent.
    return Response.json({ outcome: "error" }, { status: 500 });
  }
}
