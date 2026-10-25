import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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
