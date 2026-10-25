import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { fetchRemoteImage, isPublicAddress } from "@/server/remote-image";

describe("isPublicAddress", () => {
  it("allows public internet addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "103.21.244.10", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) expect(isPublicAddress(ip), ip).toBe(true);
  });

  it("refuses private, loopback, link-local, metadata and reserved addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.5.4",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "::",
      "fe80::1",
      "fd00::1",
      "::ffff:127.0.0.1",
      "64:ff9b::7f00:1",
      "localhost",
    ])
      expect(isPublicAddress(ip), ip).toBe(false);
  });
});

describe("fetchRemoteImage", () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  let base = "";
  const server = http.createServer((req, res) => {
    if (req.url === "/img.png") return res.writeHead(200, { "content-type": "image/png" }).end(png);
    if (req.url === "/moved") return res.writeHead(302, { location: "/img.png" }).end();
    if (req.url === "/to-loopback-v6") return res.writeHead(302, { location: `http://[::1]:${(server.address() as AddressInfo).port}/img.png` }).end();
    if (req.url === "/page") return res.writeHead(200, { "content-type": "text/html" }).end("<html></html>");
    if (req.url === "/big") return res.writeHead(200, { "content-type": "image/jpeg" }).end(Buffer.alloc(5000));
    res.writeHead(404).end();
  });
  const onlyThisServer = (ip: string) => ip === "127.0.0.1";

  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("refuses links to this machine or the private network before connecting", async () => {
    await expect(fetchRemoteImage(`${base}/img.png`)).rejects.toThrow("not a public internet address");
    await expect(fetchRemoteImage("http://localhost:9/img.png")).rejects.toThrow("not a public internet address");
    await expect(fetchRemoteImage("http://[::1]:9/img.png")).rejects.toThrow("not a public internet address");
    await expect(fetchRemoteImage("http://169.254.169.254/latest/meta-data/")).rejects.toThrow("not a public internet address");
  });

  it("refuses other schemes and links with credentials", async () => {
    await expect(fetchRemoteImage("file:///etc/passwd")).rejects.toThrow("only http(s)");
    await expect(fetchRemoteImage("ftp://example.com/a.png")).rejects.toThrow("only http(s)");
    await expect(fetchRemoteImage("https://user:pw@example.com/a.png")).rejects.toThrow("user name or password");
  });

  it("downloads an image and follows redirects, checking each hop", async () => {
    expect((await fetchRemoteImage(`${base}/img.png`, { allowAddress: onlyThisServer })).equals(png)).toBe(true);
    expect((await fetchRemoteImage(`${base}/moved`, { allowAddress: onlyThisServer })).equals(png)).toBe(true);
    await expect(fetchRemoteImage(`${base}/to-loopback-v6`, { allowAddress: onlyThisServer })).rejects.toThrow("not a public internet address");
  });

  it("refuses pages that are not images, missing files and oversized downloads", async () => {
    await expect(fetchRemoteImage(`${base}/page`, { allowAddress: onlyThisServer })).rejects.toThrow("not an image (text/html)");
    await expect(fetchRemoteImage(`${base}/nope.png`, { allowAddress: onlyThisServer })).rejects.toThrow("HTTP 404");
    await expect(fetchRemoteImage(`${base}/big`, { allowAddress: onlyThisServer, maxBytes: 1000 })).rejects.toThrow("larger than 6 MB");
  });
});
