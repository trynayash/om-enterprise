import "server-only";
/**
 * Payment provider abstraction.
 *
 * - `upi_static`  : UPI QR built from the shop's own UPI ID with the exact amount. There is NO
 *                   programmatic way to confirm receipt for a plain UPI ID — staff must check the
 *                   merchant/bank app and record the 12-digit UTR. Always available once configured.
 * - `razorpay`    : Dynamic single-use UPI QR (Razorpay QR Codes API) confirmed by a signed
 *                   `qr_code.credited` webhook. Requires a Razorpay account with QR Codes
 *                   activated, API keys and a webhook secret in environment variables.
 *                   Implemented against Razorpay's published docs; NOT yet verified against a
 *                   live account (see README "Payment integration").
 * - manual methods (cash / card terminal / bank transfer / cheque) are recorded by staff.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { buildUpiUri } from "@/lib/india";
import { D } from "@/lib/money";

export interface CollectionRequest {
  paymentId: string;
  saleNumber: string;
  amount: string; // rupees, 2dp
  expiresAt: Date;
  payeeName: string;
}

export interface CollectionResult {
  provider: string;
  qrPayload: string | null;
  qrImageUrl: string | null;
  providerOrderId: string | null;
  expiresAt: Date;
  autoVerify: boolean;
  instructions: string;
  providerData?: Record<string, unknown>;
}

export interface NormalizedPaymentEvent {
  eventId: string;
  eventType: string;
  /** Gateway object the payment was made against (QR id). */
  providerOrderId: string | null;
  providerPaymentId: string | null;
  amount: string | null; // rupees
  currency: string | null;
  status: "captured" | "failed" | "other";
  reference: string | null; // UTR / RRN
}

/* ------------------------------------------------------------------ */
/* Static UPI                                                          */
/* ------------------------------------------------------------------ */

export function createStaticUpiCollection(
  req: CollectionRequest,
  cfg: { vpa: string; payeeName: string; merchantCode?: string | null },
): CollectionResult {
  const payload = buildUpiUri({
    vpa: cfg.vpa,
    payeeName: cfg.payeeName || req.payeeName,
    amount: D(req.amount).toFixed(2),
    note: `${req.payeeName} ${req.saleNumber}`,
    merchantCode: cfg.merchantCode || null,
  });
  return {
    provider: "upi_static",
    qrPayload: payload,
    qrImageUrl: null,
    providerOrderId: null,
    expiresAt: req.expiresAt,
    autoVerify: false,
    instructions:
      "Ask the customer to scan and pay. Then open the shop's UPI/bank app, find this exact amount, and record the 12-digit UTR / UPI Ref. No. Do not confirm until you see the credit.",
  };
}

/* ------------------------------------------------------------------ */
/* Razorpay                                                            */
/* ------------------------------------------------------------------ */

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export function razorpayConfigFromEnv(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!keyId || !keySecret || !webhookSecret) return null;
  return { keyId, keySecret, webhookSecret };
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** POST /v1/payments/qr_codes — single-use, fixed-amount UPI QR (amount in paise). */
export async function createRazorpayCollection(
  req: CollectionRequest,
  cfg: RazorpayConfig,
  fetchImpl: FetchLike = fetch,
): Promise<CollectionResult> {
  const paise = D(req.amount).times(100).toDecimalPlaces(0).toNumber();
  // Razorpay allows close_by between 2 minutes and 2 hours from now.
  const minClose = Date.now() + 3 * 60_000;
  const maxClose = Date.now() + 115 * 60_000;
  const closeBy = Math.floor(Math.min(Math.max(req.expiresAt.getTime(), minClose), maxClose) / 1000);
  const res = await fetchImpl("https://api.razorpay.com/v1/payments/qr_codes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`,
    },
    body: JSON.stringify({
      type: "upi_qr",
      name: req.payeeName.slice(0, 40),
      usage: "single_use",
      fixed_amount: true,
      payment_amount: paise,
      description: `Sale ${req.saleNumber}`,
      close_by: closeBy,
      notes: { sale_number: req.saleNumber, payment_id: req.paymentId },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof body.id !== "string") {
    const msg = (body.error as { description?: string } | undefined)?.description ?? `HTTP ${res.status}`;
    throw new Error(`Razorpay QR creation failed: ${msg}`);
  }
  return {
    provider: "razorpay",
    qrPayload: typeof body.image_content === "string" ? body.image_content : null,
    qrImageUrl: typeof body.image_url === "string" ? body.image_url : null,
    providerOrderId: body.id,
    expiresAt: new Date(Number(body.close_by ?? closeBy) * 1000),
    autoVerify: true,
    instructions: "Ask the customer to scan and pay. The payment will be confirmed automatically when Razorpay notifies us.",
    providerData: { qr: { id: body.id, status: body.status, payment_amount: body.payment_amount } },
  };
}

/** Razorpay: X-Razorpay-Signature = hex(HMAC-SHA256(rawBody, webhookSecret)). */
export function verifyRazorpaySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature.toLowerCase(), "hex"));
}

export function parseRazorpayEvent(rawBody: string, eventIdHeader: string | null): NormalizedPaymentEvent {
  const j = JSON.parse(rawBody) as {
    event?: string;
    created_at?: number;
    payload?: {
      payment?: { entity?: { id?: string; amount?: number; currency?: string; status?: string; acquirer_data?: { rrn?: string } } };
      qr_code?: { entity?: { id?: string } };
    };
  };
  const pay = j.payload?.payment?.entity;
  const qr = j.payload?.qr_code?.entity;
  const eventType = j.event ?? "unknown";
  return {
    // x-razorpay-event-id is unique per event; fall back to a deterministic composite.
    eventId: eventIdHeader || `${eventType}:${pay?.id ?? qr?.id ?? ""}:${j.created_at ?? ""}`,
    eventType,
    providerOrderId: qr?.id ?? null,
    providerPaymentId: pay?.id ?? null,
    amount: typeof pay?.amount === "number" ? D(pay.amount).div(100).toFixed(2) : null,
    currency: pay?.currency ?? null,
    status: pay?.status === "captured" ? "captured" : pay?.status === "failed" ? "failed" : "other",
    reference: pay?.acquirer_data?.rrn ?? null,
  };
}
