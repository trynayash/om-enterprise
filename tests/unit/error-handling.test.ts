import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, errorMessage } from "@/lib/api-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("@/server/services/uploads");
});

describe("apiFetch when the server can't be reached", () => {
  it("says so in plain words instead of the browser's own message", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    const err = await apiFetch("/api/anything").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("NETWORK");
    expect(errorMessage(err)).toBe("Could not reach the server. Check the internet connection and try again.");
  });

  it("leaves a request the page cancelled alone", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new DOMException("The operation was aborted.", "AbortError")));
    const err = await apiFetch("/api/anything").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe("AbortError");
  });

  it("still reports what the server said when it did answer", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ ok: false, error: { code: "VALIDATION", message: "Enter a quantity.", details: null } }), { status: 422 }));
    const err = await apiFetch("/api/anything", { method: "POST", body: {} }).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 422, code: "VALIDATION", message: "Enter a quantity." });
  });
});

describe("the public image route", () => {
  const call = async (read: () => Promise<Buffer | null>) => {
    vi.doMock("@/server/services/uploads", () => ({ readObject: read }));
    const { GET } = await import("@/app/uploads/[...key]/route");
    const req = { nextUrl: new URL("http://localhost/uploads/products/ab/x.webp") };
    return GET(req as never, { params: Promise.resolve({ key: ["products", "ab", "x.webp"] }) } as never);
  };

  it("serves the image with long-lived caching", async () => {
    const res = await call(async () => Buffer.from("webp-bytes"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("immutable");
  });

  it("answers 404 for an image that is not there", async () => {
    expect((await call(async () => null)).status).toBe(404);
  });

  it("answers 503, not cacheable and with a retry hint, when the image store is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await call(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Retry-After")).toBe("5");
    expect(await res.text()).not.toContain("ECONNREFUSED");
  });
});
