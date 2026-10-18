import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

// scrypt parameters (N=2^15, r=8, p=1 ≈ 32 MiB, ~50–100 ms per hash on a small server).
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

/** Format: scrypt$N$r$p$<salt b64url>$<hash b64url> */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64url");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A real hash of a random password: used to spend equal time when the username doesn't exist. */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(24).toString("base64url"));
  return dummyHash;
}

const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123",
  "iloveyou", "admin123", "welcome123", "omenterprise", "om@12345", "india123", "abc12345",
]);

/** Returns an error message, or null if acceptable. */
export function checkPasswordStrength(password: string, opts: { minLength: number; username?: string }): string | null {
  if (password.length < opts.minLength) return `Password must be at least ${opts.minLength} characters`;
  if (password.length > 200) return "Password is too long";
  if (/^(.)\1+$/.test(password)) return "Password cannot be a single repeated character";
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "This password is too common";
  if (opts.username && lower.includes(opts.username.toLowerCase())) return "Password must not contain the username";
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 2) return "Use a mix of letters, numbers or symbols";
  return null;
}

/** Readable random temporary password, e.g. "Kite-7342-Moss". */
export function generateTempPassword(): string {
  const words = ["Kite", "Moss", "Brick", "River", "Cedar", "Ember", "Stone", "Maple", "Coral", "Tiger", "Lotus", "Pearl"];
  const b = randomBytes(4);
  const w1 = words[b[0] % words.length];
  const w2 = words[b[1] % words.length];
  const num = (b.readUInt16BE(2) % 9000) + 1000;
  return `${w1}-${num}-${w2}`;
}
