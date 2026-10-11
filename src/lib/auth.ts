import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { MIN_SECRET_LENGTH } from "./session";

export type AuthConfig = { username: string; passwordHash: string; secret: string };

// Returns null when the admin area has not been configured. There are no
// default credentials: an unconfigured deployment simply cannot log in.
export function getAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig | null {
  const username = env.ADMIN_USERNAME;
  const passwordHash = env.ADMIN_PASSWORD_HASH;
  const secret = env.SESSION_SECRET;
  if (!username || !passwordHash || !secret || secret.length < MIN_SECRET_LENGTH) return null;
  return { username, passwordHash, secret };
}

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== 64) return false;
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"));
  return timingSafeEqual(actual, expected);
}

export function safeEqualStrings(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Client identity for rate limiting. Vercel documents that it OVERWRITES
// x-forwarded-for to stop clients spoofing it, so that is the header we trust
// first. x-real-ip is only a fallback: its handling is not documented the same
// way, so it must never take priority. On other hosts, make sure your proxy
// overwrites x-forwarded-for, otherwise the per-IP limit can be bypassed (the
// global limit still applies). The IP is hashed before it is stored.
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "unknown";
}

export function hashForKey(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex").slice(0, 32);
}
