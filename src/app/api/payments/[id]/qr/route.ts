import QRCode from "qrcode";
import { api } from "@/server/http";
import { getPayment } from "@/server/services/payments";
import { notFound } from "@/server/errors";

/** SVG QR for a static UPI payment request (exact amount encoded). */
export const GET = api({ permission: ["payments.record", "payments.view"] }, async ({ actor, params }) => {
  const { payment } = await getPayment(actor, params.id);
  if (!payment.qrPayload) throw notFound("QR");
  const svg = await QRCode.toString(payment.qrPayload, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#0D1B30", light: "#FFFFFF" } });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, no-store" } });
});
