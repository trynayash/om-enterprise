import "server-only";
import { lookup, type LookupAddress, type LookupOptions } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";

/**
 * Downloads an image from a web address a staff member typed in (bulk import `image_url`).
 * Only public internet hosts are reached: the address is checked when the connection is made,
 * on every redirect, so a link can't be pointed at this server, the database or the cloud
 * metadata service. Size, type and time are capped.
 */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const PRIVATE = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  PRIVATE.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  PRIVATE.addSubnet(net, bits, "ipv6");

/** True for an address on the public internet (not private, loopback, link-local or reserved). */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return !PRIVATE.check(ip, "ipv4");
  if (family === 6) {
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    if (mapped) return isPublicAddress(mapped);
    return !PRIVATE.check(ip, "ipv6");
  }
  return false;
}

interface FetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Which resolved addresses may be connected to; tests swap this to reach a local server. */
  allowAddress?: (ip: string) => boolean;
}

export async function fetchRemoteImage(url: string, opts: FetchOptions = {}): Promise<Buffer> {
  const { maxBytes = MAX_IMAGE_BYTES, timeoutMs = 20_000, maxRedirects = 3, allowAddress = isPublicAddress } = opts;
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await request(current, allowAddress, timeoutMs, maxBytes);
    if (res.redirect) {
      current = new URL(res.redirect, current).href;
      continue;
    }
    return res.body!;
  }
  throw new Error("too many redirects");
}

function request(raw: string, allowAddress: (ip: string) => boolean, timeoutMs: number, maxBytes: number): Promise<{ redirect?: string; body?: Buffer }> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return reject(new Error("not a web address"));
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return reject(new Error("only http(s) links are allowed"));
    if (url.username || url.password) return reject(new Error("links with a user name or password are not allowed"));
    const host = url.hostname.replace(/^\[|\]$/g, "");
    // An IP written in the link skips name lookup, so check it here.
    if (isIP(host) && !allowAddress(host)) return reject(new Error("not a public internet address"));

    const safeLookup = (hostname: string, options: LookupOptions, cb: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) => {
      lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return cb(err, []);
        const list = addresses as LookupAddress[];
        if (!list.length || list.some((a) => !allowAddress(a.address))) return cb(Object.assign(new Error("not a public internet address"), { code: "EBLOCKED" }), []);
        if (options.all) cb(null, list);
        else cb(null, list[0].address, list[0].family);
      });
    };

    const client = url.protocol === "https:" ? https : http;
    const req = client.get(
      url,
      {
        lookup: safeLookup as never,
        timeout: timeoutMs,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; OM-Enterprise-catalogue-import)", Accept: "image/*" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ redirect: res.headers.location });
        }
        if (status !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${status}`));
        }
        const type = String(res.headers["content-type"] ?? "");
        if (!type.startsWith("image/")) {
          res.resume();
          return reject(new Error(`not an image (${type || "no content type"})`));
        }
        if (Number(res.headers["content-length"] ?? 0) > maxBytes) {
          res.destroy();
          return reject(new Error("larger than 6 MB"));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            res.destroy();
            reject(new Error("larger than 6 MB"));
          } else chunks.push(c);
        });
        res.on("end", () => resolve({ body: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    // The socket timeout only covers idle time; this caps the whole download.
    const deadline = setTimeout(() => req.destroy(new Error("timed out")), timeoutMs);
    req.on("close", () => clearTimeout(deadline));
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", (e) => reject(new Error((e as NodeJS.ErrnoException).code === "EBLOCKED" ? "not a public internet address" : e.message)));
  });
}
