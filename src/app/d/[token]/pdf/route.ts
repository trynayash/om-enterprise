import type { NextRequest } from "next/server";
import { getDocumentByShareToken } from "@/server/services/documents";
import { renderDocumentPdf } from "@/server/pdf/document-pdf";
import { enforceRateLimit, hashIp } from "@/server/rate-limit";
import { clientInfoFromHeaders } from "@/server/auth/session";
import { toAppError } from "@/server/errors";
import { customerCopyLabel } from "@/lib/bill-layout";

/** Customer-facing PDF via an unguessable share link (revocable by staff). */
export async function GET(req: NextRequest, ctx: RouteContext<"/d/[token]/pdf">) {
  try {
    await enforceRateLimit(`share:${hashIp(clientInfoFromHeaders(req.headers).ip)}`, 60, 600);
    const { token } = await ctx.params;
    const doc = await getDocumentByShareToken(token);
    if (!doc) return new Response("This link is invalid or has been withdrawn.", { status: 404 });
    const pdf = await renderDocumentPdf(doc.snapshot, { status: doc.status, cancelReason: doc.cancelReason, copyLabel: customerCopyLabel(doc.docType) });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.docNumber.replace(/\//g, "-")}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    const e = toAppError(err);
    return new Response(e.message, { status: e.status });
  }
}
