import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AppError, precondition } from "@/server/errors";

/**
 * Sending email, for bills. One provider: Resend (https://resend.com), called over HTTPS so it works on
 * a serverless host with no mail server. Set on the server only:
 *
 *   RESEND_API_KEY   the Resend API key (sending access is enough)
 *   EMAIL_FROM       who the mail is from, e.g.  OM ENTERPRISE <bills@your-verified-domain>
 *
 * For development and tests, EMAIL_OUTBOX_DIR makes mail go to files in that folder instead — nothing is
 * sent anywhere.
 */
export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string | null;
  attachments?: MailAttachment[];
}

type Env = Record<string, string | undefined>;

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 20_000;

/** Whether mail can be sent: a sender address, and a key (or an outbox folder). */
export function emailConfigured(env: Env = process.env): boolean {
  return !!env.EMAIL_FROM?.trim() && (!!env.RESEND_API_KEY?.trim() || !!env.EMAIL_OUTBOX_DIR?.trim());
}

/** What the shop's mail says it is from, for showing on screen. */
export function emailSender(env: Env = process.env): string | null {
  return env.EMAIL_FROM?.trim() || null;
}

export async function sendMail(msg: MailMessage, env: Env = process.env): Promise<{ id: string | null }> {
  const from = env.EMAIL_FROM?.trim();
  if (!from || !emailConfigured(env)) throw precondition("Email is not set up for this shop yet. The owner needs to connect the email service (see the README, 'Sending bills by email').");

  if (env.EMAIL_OUTBOX_DIR?.trim()) return writeToOutbox(env.EMAIL_OUTBOX_DIR.trim(), from, msg);

  let res: Response;
  try {
    res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY!.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
        ...(msg.attachments?.length ? { attachments: msg.attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64"), content_type: a.contentType })) } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AppError("INTERNAL", "The email service did not answer. Nothing was sent — try again in a minute.");
  }
  if (res.ok) {
    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return { id: body?.id ?? null };
  }
  throw failureOf(res.status, await res.json().catch(() => null));
}

/** Resend's refusals, in words for the counter. The key is never repeated. */
function failureOf(status: number, body: { message?: string } | null): AppError {
  if (status === 401 || status === 403) return new AppError("PRECONDITION", "The email service refused the shop's key or sender address. The owner needs to check the email settings.");
  if (status === 422 || status === 400) return new AppError("VALIDATION", `The email service did not accept this message${body?.message ? `: ${body.message}` : ""}.`);
  if (status === 429) return new AppError("RATE_LIMITED", "Too many emails were sent just now. Wait a minute and try again.");
  return new AppError("INTERNAL", "The email service had a problem. Nothing was sent — try again in a minute.");
}

/** Development and tests: the message and its attachments as files, one folder per message. */
async function writeToOutbox(dir: string, from: string, msg: MailMessage): Promise<{ id: string }> {
  const id = randomUUID();
  const folder = path.resolve(dir, id);
  await mkdir(folder, { recursive: true });
  const attachments = [];
  for (const a of msg.attachments ?? []) {
    const file = a.filename.replace(/[^\w.-]/g, "_");
    await writeFile(path.join(folder, file), a.content);
    attachments.push({ filename: a.filename, file, contentType: a.contentType, bytes: a.content.length });
  }
  await writeFile(
    path.join(folder, "message.json"),
    JSON.stringify({ id, from, to: msg.to, replyTo: msg.replyTo ?? null, subject: msg.subject, text: msg.text, html: msg.html, attachments }, null, 2),
  );
  return { id };
}
