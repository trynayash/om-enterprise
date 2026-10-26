import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendWhatsAppDocument, whatsappConfigured } from "@/server/whatsapp";

const TOKEN = "EAAG-test-token-do-not-leak";
const env = { WHATSAPP_TOKEN: TOKEN, WHATSAPP_PHONE_NUMBER_ID: "1234567890", WHATSAPP_TEMPLATE: "bill_pdf" };
const message = { to: "919876543210", pdf: Buffer.from("%PDF-1.7 test"), filename: "BS-26-27-00012.pdf", bodyValues: ["Ramesh Patel", "Bill of Supply BS/26-27/00012", "₹2,650.00"] };

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Answers Meta's two calls (upload, then send) and records what was asked. */
function fakeMeta(answers: [number, unknown][]) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const [status, body] = answers[calls.length - 1];
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  return calls;
}

describe("WhatsApp settings", () => {
  it("is ready only with a key, a number id and a template (or the test outbox)", () => {
    expect(whatsappConfigured({})).toBe(false);
    expect(whatsappConfigured({ WHATSAPP_TOKEN: TOKEN, WHATSAPP_PHONE_NUMBER_ID: "1" })).toBe(false);
    expect(whatsappConfigured(env)).toBe(true);
    expect(whatsappConfigured({ WHATSAPP_OUTBOX_DIR: "/tmp/x" })).toBe(true);
  });
});

describe("sending a bill on WhatsApp", () => {
  it("uploads the PDF, then sends the approved template with it as the document header", async () => {
    const calls = fakeMeta([
      [200, { id: "media-42" }],
      [200, { messaging_product: "whatsapp", messages: [{ id: "wamid.ABC" }] }],
    ]);
    const res = await sendWhatsAppDocument(message, env);
    expect(res).toEqual({ id: "wamid.ABC" });

    const [upload, send] = calls;
    expect(upload.url).toBe("https://graph.facebook.com/v23.0/1234567890/media");
    expect((upload.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    const form = upload.init.body as FormData;
    expect(form.get("messaging_product")).toBe("whatsapp");
    expect(form.get("type")).toBe("application/pdf");
    const file = form.get("file") as File;
    expect(file.name).toBe("BS-26-27-00012.pdf");
    expect(Buffer.from(await file.arrayBuffer()).toString()).toBe("%PDF-1.7 test");

    expect(send.url).toBe("https://graph.facebook.com/v23.0/1234567890/messages");
    expect(JSON.parse(String(send.init.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "919876543210",
      type: "template",
      template: {
        name: "bill_pdf",
        language: { code: "en" },
        components: [
          { type: "header", parameters: [{ type: "document", document: { id: "media-42", filename: "BS-26-27-00012.pdf" } }] },
          {
            type: "body",
            parameters: [
              { type: "text", text: "Ramesh Patel" },
              { type: "text", text: "Bill of Supply BS/26-27/00012" },
              { type: "text", text: "₹2,650.00" },
            ],
          },
        ],
      },
    });
  });

  it("uses the language and API version the shop set", async () => {
    const calls = fakeMeta([
      [200, { id: "m" }],
      [200, { messages: [{ id: "w" }] }],
    ]);
    await sendWhatsAppDocument(message, { ...env, WHATSAPP_TEMPLATE_LANGUAGE: "en_US", WHATSAPP_API_VERSION: "v25.0" });
    expect(calls[1].url).toBe("https://graph.facebook.com/v25.0/1234567890/messages");
    expect(JSON.parse(String(calls[1].init.body)).template.language).toEqual({ code: "en_US" });
  });

  it("says in plain words why WhatsApp refused, and never repeats the key", async () => {
    const cases: [number, unknown, RegExp][] = [
      [401, { error: { code: 190, message: `Invalid OAuth access token ${TOKEN}` } }, /access key/],
      [404, { error: { code: 132001, message: "Template name does not exist" } }, /template/],
      [400, { error: { code: 132000, message: "Number of parameters does not match" } }, /does not match/],
      [400, { error: { code: 131026, message: "Message undeliverable" } }, /WhatsApp number/],
      [429, { error: { code: 131056, message: "Pair rate limit hit" } }, /limiting/],
      [500, { error: { code: 1, message: "Unknown" } }, /Nothing was sent/],
    ];
    for (const [status, body, expected] of cases) {
      fakeMeta([
        [200, { id: "m" }],
        [status, body],
      ]);
      const err = (await sendWhatsAppDocument(message, env).catch((e: unknown) => e)) as Error;
      expect(err.message).toMatch(expected);
      expect(err.message).not.toContain(TOKEN);
    }
  });

  it("stops before sending when the PDF is not accepted, or WhatsApp cannot be reached", async () => {
    const calls = fakeMeta([[400, { error: { code: 100, message: "Invalid parameter" } }]]);
    await expect(sendWhatsAppDocument(message, env)).rejects.toThrow(/settings/);
    expect(calls).toHaveLength(1);
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));
    await expect(sendWhatsAppDocument(message, env)).rejects.toThrow(/Could not reach WhatsApp/);
  });

  it("writes to the outbox folder instead of sending, for development and tests", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "wa-outbox-"));
    vi.stubGlobal("fetch", () => {
      throw new Error("must not be called");
    });
    await sendWhatsAppDocument(message, { WHATSAPP_OUTBOX_DIR: dir, WHATSAPP_TEMPLATE: "bill_pdf" });
    const [folder] = await readdir(dir);
    const saved = JSON.parse(await readFile(path.join(dir, folder, "message.json"), "utf8"));
    expect(saved).toMatchObject({ to: "919876543210", template: "bill_pdf", filename: "BS-26-27-00012.pdf", bodyValues: message.bodyValues });
    expect((await readFile(path.join(dir, folder, saved.file))).toString()).toBe("%PDF-1.7 test");
  });

  it("refuses when nothing is set up", async () => {
    await expect(sendWhatsAppDocument(message, {})).rejects.toThrow(/not set up/);
  });
});
