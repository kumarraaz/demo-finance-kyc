import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
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

// Simple in-memory limiter for failed logins. It resets on restart and is
// per-instance, so on serverless hosting it is a speed bump, not a guarantee.
export class LoginLimiter {
  private failures = new Map<string, { count: number; first: number }>();
  constructor(
    private max = 5,
    private windowMs = 15 * 60 * 1000,
  ) {}

  isBlocked(key: string, now = Date.now()): boolean {
    const f = this.failures.get(key);
    if (!f) return false;
    if (now - f.first > this.windowMs) {
      this.failures.delete(key);
      return false;
    }
    return f.count >= this.max;
  }

  recordFailure(key: string, now = Date.now()): void {
    const f = this.failures.get(key);
    if (!f || now - f.first > this.windowMs) this.failures.set(key, { count: 1, first: now });
    else f.count++;
  }

  reset(key: string): void {
    this.failures.delete(key);
  }
}

export const loginLimiter = new LoginLimiter();
