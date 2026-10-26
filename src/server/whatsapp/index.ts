import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AppError, precondition } from "@/server/errors";

/**
 * Sending a bill on WhatsApp from the shop's own number, through WhatsApp's business platform (the
 * WhatsApp Cloud API from Meta). Set on the server only:
 *
 *   WHATSAPP_TOKEN            a permanent access token for the shop's WhatsApp business account
 *   WHATSAPP_PHONE_NUMBER_ID  the id Meta gives the shop's number (not the number itself)
 *   WHATSAPP_TEMPLATE         the approved message template that carries the bill (see the README,
 *                             "Sending bills on WhatsApp"): a Document header and three body values
 *   WHATSAPP_TEMPLATE_LANGUAGE  its language code, default "en"
 *   WHATSAPP_API_VERSION      Graph API version, default v23.0
 *   WHATSAPP_OUTBOX_DIR       development and tests: write each message to a folder, send nothing
 *
 * Meta only lets a business start a chat with an approved template, so the bill always goes out as
 * that template with the PDF attached.
 */
type Env = Record<string, string | undefined>;

export interface WhatsAppDocument {
  /** The customer's number with country code and no "+", e.g. 919876543210. */
  to: string;
  pdf: Buffer;
  filename: string;
  /** The template's body values, in order: customer name, which document, amount. */
  bodyValues: string[];
}

const TIMEOUT_MS = 20_000;

/** Whether bills can go out on WhatsApp from the shop's number. */
export function whatsappConfigured(env: Env = process.env): boolean {
  if (env.WHATSAPP_OUTBOX_DIR?.trim()) return true;
  return !!(env.WHATSAPP_TOKEN?.trim() && env.WHATSAPP_PHONE_NUMBER_ID?.trim() && env.WHATSAPP_TEMPLATE?.trim());
}

export async function sendWhatsAppDocument(msg: WhatsAppDocument, env: Env = process.env): Promise<{ id: string | null }> {
  if (!whatsappConfigured(env)) throw precondition("WhatsApp sending is not set up for this shop yet (see the README, 'Sending bills on WhatsApp').");
  if (env.WHATSAPP_OUTBOX_DIR?.trim()) return writeToOutbox(env.WHATSAPP_OUTBOX_DIR.trim(), msg, env);

  const base = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION?.trim() || "v23.0"}/${env.WHATSAPP_PHONE_NUMBER_ID!.trim()}`;
  const auth = { Authorization: `Bearer ${env.WHATSAPP_TOKEN!.trim()}` };

  // 1. The PDF goes up as media; the message then points at it by id.
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append("file", new Blob([new Uint8Array(msg.pdf)], { type: "application/pdf" }), msg.filename);
  const media = await call<{ id?: string }>(`${base}/media`, { method: "POST", headers: auth, body: form });
  if (!media.id) throw new AppError("INTERNAL", "WhatsApp did not accept the bill's PDF. Nothing was sent — try again in a minute.");

  // 2. The approved template, with the PDF as its document header.
  const sent = await call<{ messages?: { id?: string }[] }>(`${base}/messages`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: msg.to,
      type: "template",
      template: {
        name: env.WHATSAPP_TEMPLATE!.trim(),
        language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en" },
        components: [
          { type: "header", parameters: [{ type: "document", document: { id: media.id, filename: msg.filename } }] },
          { type: "body", parameters: msg.bodyValues.map((text) => ({ type: "text", text })) },
        ],
      },
    }),
  });
  return { id: sent.messages?.[0]?.id ?? null };
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new AppError("INTERNAL", "Could not reach WhatsApp. Nothing was sent — try again in a minute.");
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: MetaError }) | null;
  if (res.ok && body && !body.error) return body;
  throw whatsappFailure(body?.error ?? null, res.status);
}

interface MetaError {
  code?: number;
  error_subcode?: number;
  message?: string;
  error_data?: { details?: string };
}

/** WhatsApp's refusals, in words for the counter. The token is never repeated. */
export function whatsappFailure(e: MetaError | null, status: number): AppError {
  const code = e?.code;
  if (code === 190 || status === 401)
    return new AppError("PRECONDITION", "WhatsApp refused the shop's access key; it may have expired. The owner needs to renew WHATSAPP_TOKEN in the server settings.");
  if (code === 10 || code === 200 || code === 100 || status === 403)
    return new AppError("PRECONDITION", "WhatsApp did not accept the shop's settings (number id, key or permissions). The owner needs to check the WhatsApp settings.");
  if (code === 132001)
    return new AppError("PRECONDITION", "WhatsApp does not have the bill message template (or not in this language). The owner needs to check WHATSAPP_TEMPLATE and that it is approved.");
  if (code === 132000 || code === 132012 || code === 131008 || code === 131009)
    return new AppError("PRECONDITION", "The bill message template on WhatsApp does not match what the shop sends (a document header and three values). The owner needs to check it.");
  if (code === 131026) return new AppError("VALIDATION", "WhatsApp could not deliver to that number. Check it is the customer's WhatsApp number.");
  if (code === 131056 || code === 130429 || code === 4 || code === 80007 || status === 429)
    return new AppError("RATE_LIMITED", "WhatsApp is limiting how fast the shop can send just now. Wait a minute and try again.");
  if (code === 131042) return new AppError("PRECONDITION", "WhatsApp has paused sending for the shop: there is a payment problem on the WhatsApp business account.");
  if (code === 131031 || code === 368) return new AppError("PRECONDITION", "WhatsApp has blocked sending from the shop's business account. The owner needs to check it in Meta Business Suite.");
  if (code === 133010) return new AppError("PRECONDITION", "The shop's number is not registered for WhatsApp business messages yet.");
  return new AppError("INTERNAL", "WhatsApp had a problem. Nothing was sent — try again in a minute.");
}

/** Development and tests: the message and its PDF as files, one folder per message. */
async function writeToOutbox(dir: string, msg: WhatsAppDocument, env: Env): Promise<{ id: string }> {
  const id = randomUUID();
  const folder = path.resolve(dir, id);
  await mkdir(folder, { recursive: true });
  const file = msg.filename.replace(/[^\w.-]/g, "_");
  await writeFile(path.join(folder, file), msg.pdf);
  await writeFile(
    path.join(folder, "message.json"),
    JSON.stringify({ id, to: msg.to, template: env.WHATSAPP_TEMPLATE?.trim() || null, filename: msg.filename, file, bytes: msg.pdf.length, bodyValues: msg.bodyValues }, null, 2),
  );
  return { id };
}
