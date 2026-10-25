import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { simpleParser, type ParsedMail } from "mailparser";
import { SMTPServer } from "smtp-server";
import { emailConfigured, sendMail } from "@/server/email";

const KEY = "re_test_key_do_not_leak";
const env = { RESEND_API_KEY: KEY, EMAIL_FROM: "OM ENTERPRISE <bills@example.com>" };
const message = {
  to: "ramesh@example.com",
  subject: "Bill of Supply BS/26-27/00003 from OM ENTERPRISE",
  text: "Hello",
  html: "<p>Hello</p>",
  replyTo: "shop@example.com",
  attachments: [{ filename: "BS-26-27-00003.pdf", content: Buffer.from("%PDF-1.4 test"), contentType: "application/pdf" }],
};

afterEach(() => vi.unstubAllGlobals());

const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

describe("emailConfigured", () => {
  it("needs a sender and a key (or an outbox folder)", () => {
    expect(emailConfigured({ ...env })).toBe(true);
    expect(emailConfigured({ EMAIL_FROM: env.EMAIL_FROM })).toBe(false);
    expect(emailConfigured({ RESEND_API_KEY: KEY })).toBe(false);
    expect(emailConfigured({ EMAIL_FROM: env.EMAIL_FROM, EMAIL_OUTBOX_DIR: "/tmp/outbox" })).toBe(true);
    expect(emailConfigured({ EMAIL_FROM: "  ", RESEND_API_KEY: KEY })).toBe(false);
    // The shop's own mailbox needs both its address and its password.
    expect(emailConfigured({ EMAIL_FROM: env.EMAIL_FROM, SMTP_USER: "shop@gmail.com", SMTP_PASSWORD: "app password" })).toBe(true);
    expect(emailConfigured({ EMAIL_FROM: env.EMAIL_FROM, SMTP_USER: "shop@gmail.com" })).toBe(false);
    expect(emailConfigured({ EMAIL_FROM: env.EMAIL_FROM, SMTP_PASSWORD: "app password" })).toBe(false);
  });
});

describe("sendMail through Resend", () => {
  it("posts the message with the PDF attached, and returns the message id", async () => {
    const fetchMock = answer(200, { id: "msg_123" });
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendMail(message, env)).toEqual({ id: "msg_123" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ from: env.EMAIL_FROM, to: ["ramesh@example.com"], subject: message.subject, reply_to: "shop@example.com" });
    expect(body.attachments).toEqual([{ filename: "BS-26-27-00003.pdf", content: Buffer.from("%PDF-1.4 test").toString("base64"), content_type: "application/pdf" }]);
  });

  it("explains a refusal in words for the counter, and never repeats the key", async () => {
    const cases: [number, unknown, string, RegExp][] = [
      [401, { message: `API key ${KEY} is invalid` }, "PRECONDITION", /refused the shop's key or sender/],
      [403, { message: "domain not verified" }, "PRECONDITION", /refused the shop's key or sender/],
      [422, { message: "Invalid `to` field" }, "VALIDATION", /did not accept this message: Invalid `to` field/],
      [429, {}, "RATE_LIMITED", /Too many emails/],
      [500, {}, "INTERNAL", /had a problem. Nothing was sent/],
    ];
    for (const [status, body, code, words] of cases) {
      vi.stubGlobal("fetch", answer(status, body));
      const err = await sendMail(message, env).catch((e) => e);
      expect(err.code, String(status)).toBe(code);
      expect(err.message, String(status)).toMatch(words);
      expect(err.message).not.toContain(KEY);
    }
  });

  it("says nothing was sent when the service does not answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("fetch failed"))),
    );
    const err = await sendMail(message, env).catch((e) => e);
    expect(err.code).toBe("INTERNAL");
    expect(err.message).toMatch(/did not answer. Nothing was sent/);
  });

  it("refuses to run unconfigured, without calling out", async () => {
    const fetchMock = answer(200, { id: "x" });
    vi.stubGlobal("fetch", fetchMock);
    const err = await sendMail(message, {}).catch((e) => e);
    expect(err.code).toBe("PRECONDITION");
    expect(err.message).toMatch(/not set up/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sendMail to an outbox folder", () => {
  it("writes the message and its PDF to files instead of sending anything", async () => {
    const fetchMock = answer(200, { id: "x" });
    vi.stubGlobal("fetch", fetchMock);
    const dir = await mkdtemp(path.join(tmpdir(), "outbox-"));
    const sent = await sendMail(message, { EMAIL_FROM: env.EMAIL_FROM, EMAIL_OUTBOX_DIR: dir });
    const id = sent.id!;
    expect(fetchMock).not.toHaveBeenCalled();
    const files = (await readdir(path.join(dir, id))).sort();
    expect(files).toEqual(["BS-26-27-00003.pdf", "message.json"]);
    const saved = JSON.parse(await readFile(path.join(dir, id, "message.json"), "utf8"));
    expect(saved).toMatchObject({ from: env.EMAIL_FROM, to: "ramesh@example.com", replyTo: "shop@example.com", subject: message.subject });
    expect(saved.attachments).toEqual([{ filename: "BS-26-27-00003.pdf", file: "BS-26-27-00003.pdf", contentType: "application/pdf", bytes: 13 }]);
    expect((await readFile(path.join(dir, id, "BS-26-27-00003.pdf"))).toString()).toBe("%PDF-1.4 test");
  });
});

/** A real SMTP server on this machine that takes one login and keeps what it is sent. */
async function mailServer(login = { user: "shop@gmail.com", pass: "abcd efgh ijkl mnop" }) {
  const received: ParsedMail[] = [];
  const server = new SMTPServer({
    allowInsecureAuth: true,
    disabledCommands: ["STARTTLS"],
    onAuth: (auth, _session, done) => (auth.username === login.user && auth.password === login.pass ? done(null, { user: auth.username }) : done(new Error("Invalid login"))),
    onRcptTo: (address, _session, done) => {
      if (!address.address.startsWith("nobody@")) return done();
      done(Object.assign(new Error("5.1.1 The email account that you tried to reach does not exist"), { responseCode: 550 }));
    },
    onData: (stream, _session, done) => {
      simpleParser(stream).then(
        (mail) => {
          received.push(mail);
          done();
        },
        (err) => done(err),
      );
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.server.address() as AddressInfo).port;
  const smtpEnv = { EMAIL_FROM: "OM ENTERPRISE <shop@gmail.com>", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(port), SMTP_SECURE: "false", SMTP_USER: login.user, SMTP_PASSWORD: login.pass };
  return { received, smtpEnv, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

describe("sendMail through the shop's own mailbox (SMTP)", () => {
  it("signs in and sends the message with the PDF attached", async () => {
    const mail = await mailServer();
    try {
      const sent = await sendMail(message, mail.smtpEnv);
      expect(sent.id).toBeTruthy();
      expect(mail.received).toHaveLength(1);
      const got = mail.received[0];
      expect(got.from?.value[0]).toMatchObject({ name: "OM ENTERPRISE", address: "shop@gmail.com" });
      expect(got.to).toMatchObject({ value: [{ address: "ramesh@example.com" }] });
      expect(got.replyTo?.value[0].address).toBe("shop@example.com");
      expect(got.subject).toBe(message.subject);
      expect(got.text?.trim()).toBe("Hello");
      expect(got.html).toContain("<p>Hello</p>");
      expect(got.attachments).toHaveLength(1);
      expect(got.attachments[0]).toMatchObject({ filename: "BS-26-27-00003.pdf", contentType: "application/pdf" });
      expect(got.attachments[0].content.toString()).toBe("%PDF-1.4 test");
    } finally {
      await mail.close();
    }
  });

  it("explains a wrong password, a refused address and an unreachable server, and never repeats the password", async () => {
    const mail = await mailServer();
    try {
      const wrong = await sendMail(message, { ...mail.smtpEnv, SMTP_PASSWORD: "not the password" }).catch((e) => e);
      expect(wrong.code).toBe("PRECONDITION");
      expect(wrong.message).toMatch(/refused the shop's sign-in/);
      expect(wrong.message).not.toContain("not the password");

      const refused = await sendMail({ ...message, to: "nobody@example.com" }, mail.smtpEnv).catch((e) => e);
      expect(refused.code).toBe("VALIDATION");
      expect(refused.message).toMatch(/did not accept that address/);
      expect(mail.received).toHaveLength(0);
    } finally {
      await mail.close();
    }
    // The server is now closed: nothing listens on that port.
    const down = await sendMail(message, mail.smtpEnv).catch((e) => e);
    expect(down.code).toBe("INTERNAL");
    expect(down.message).toMatch(/Could not reach the mail service. Nothing was sent/);
  });

  it("is used in preference to Resend when both are set, and the outbox beats both", async () => {
    const fetchMock = answer(200, { id: "x" });
    vi.stubGlobal("fetch", fetchMock);
    const mail = await mailServer();
    try {
      await sendMail(message, { ...mail.smtpEnv, RESEND_API_KEY: KEY });
      expect(mail.received).toHaveLength(1);
      expect(fetchMock).not.toHaveBeenCalled();
      const dir = await mkdtemp(path.join(tmpdir(), "outbox-"));
      await sendMail(message, { ...mail.smtpEnv, RESEND_API_KEY: KEY, EMAIL_OUTBOX_DIR: dir });
      expect(mail.received).toHaveLength(1);
      expect(await readdir(dir)).toHaveLength(1);
    } finally {
      await mail.close();
    }
  });
});
