import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { AppError, precondition } from "@/server/errors";

/**
 * Sending email, for bills. Set on the server only. The sender is always:
 *
 *   EMAIL_FROM        who the mail is from, e.g.  OM ENTERPRISE <shop@gmail.com>
 *
 * and how it is sent is the first of these that is set:
 *
 *   EMAIL_OUTBOX_DIR  development and tests: each message is written to a folder, nothing is sent
 *   SMTP_USER + SMTP_PASSWORD
 *                     the shop's own mailbox, over SMTP. SMTP_HOST defaults to smtp.gmail.com (port 465);
 *                     for Gmail the password is an "app password" and EMAIL_FROM must be that Gmail address
 *   RESEND_API_KEY    Resend (https://resend.com) over HTTPS, from a domain verified there
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
type Way = "outbox" | "smtp" | "resend";

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 20_000;

function wayOf(env: Env): Way | null {
  if (!env.EMAIL_FROM?.trim()) return null;
  if (env.EMAIL_OUTBOX_DIR?.trim()) return "outbox";
  if (env.SMTP_USER?.trim() && env.SMTP_PASSWORD) return "smtp";
  if (env.RESEND_API_KEY?.trim()) return "resend";
  return null;
}

/** Whether mail can be sent: a sender address and a way to send. */
export function emailConfigured(env: Env = process.env): boolean {
  return wayOf(env) !== null;
}

const NOT_SET_UP = "Email is not set up for this shop yet. The owner needs to connect the email service (see the README, 'Sending bills by email').";

export async function sendMail(msg: MailMessage, env: Env = process.env): Promise<{ id: string | null }> {
  const way = wayOf(env);
  const from = env.EMAIL_FROM?.trim();
  if (!way || !from) throw precondition(NOT_SET_UP);
  if (way === "outbox") return writeToOutbox(env.EMAIL_OUTBOX_DIR!.trim(), from, msg);
  if (way === "smtp") return sendBySmtp(from, msg, env);
  return sendByResend(from, msg, env.RESEND_API_KEY!.trim());
}

/* ---------------------------------- SMTP ---------------------------------- */

async function sendBySmtp(from: string, msg: MailMessage, env: Env): Promise<{ id: string | null }> {
  const port = Number(env.SMTP_PORT) || 465;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port,
    // Port 465 is encrypted from the first byte; others start plain and upgrade (STARTTLS) when offered.
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465,
    auth: { user: env.SMTP_USER!.trim(), pass: env.SMTP_PASSWORD! },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS * 2,
  });
  try {
    const info = await transport.sendMail({
      from,
      to: msg.to,
      replyTo: msg.replyTo ?? undefined,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
    });
    return { id: info.messageId ?? null };
  } catch (err) {
    throw smtpFailure(err);
  } finally {
    transport.close();
  }
}

/** The mail server's refusals, in words for the counter. The password is never repeated. */
function smtpFailure(err: unknown): AppError {
  const e = err as { code?: string; responseCode?: number; response?: string };
  if (e.code === "EAUTH")
    return new AppError("PRECONDITION", "The mail account refused the shop's sign-in. The owner needs to check the email password in the server settings (for Gmail it must be an app password).");
  if (e.code === "EENVELOPE" || (e.responseCode && [501, 550, 551, 553].includes(e.responseCode))) {
    if (e.responseCode === 550 && /5\.4\.5|limit/i.test(e.response ?? ""))
      return new AppError("RATE_LIMITED", "The mail account has reached its daily sending limit. Try again tomorrow, or send the PDF another way.");
    return new AppError("VALIDATION", "The mail service did not accept that address. Check it and try again.");
  }
  if (e.responseCode && [421, 450, 451, 452].includes(e.responseCode))
    return new AppError("RATE_LIMITED", "The mail service is busy or limiting the shop's sending just now. Wait a few minutes and try again.");
  if (e.code === "ETIMEDOUT" || e.code === "ECONNECTION" || e.code === "ESOCKET" || e.code === "EDNS")
    return new AppError("INTERNAL", "Could not reach the mail service. Nothing was sent — try again in a minute.");
  return new AppError("INTERNAL", "The mail service had a problem. Nothing was sent — try again in a minute.");
}

/* --------------------------------- Resend --------------------------------- */

async function sendByResend(from: string, msg: MailMessage, apiKey: string): Promise<{ id: string | null }> {
  let res: Response;
  try {
    res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
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
  throw resendFailure(res.status, await res.json().catch(() => null));
}

function resendFailure(status: number, body: { message?: string } | null): AppError {
  if (status === 401 || status === 403) return new AppError("PRECONDITION", "The email service refused the shop's key or sender address. The owner needs to check the email settings.");
  if (status === 422 || status === 400) return new AppError("VALIDATION", `The email service did not accept this message${body?.message ? `: ${body.message}` : ""}.`);
  if (status === 429) return new AppError("RATE_LIMITED", "Too many emails were sent just now. Wait a minute and try again.");
  return new AppError("INTERNAL", "The email service had a problem. Nothing was sent — try again in a minute.");
}

/* --------------------------------- Outbox --------------------------------- */

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
