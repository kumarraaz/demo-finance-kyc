// Signed, expiring session token using Web Crypto (HMAC-SHA256).
// The token only proves "we issued this". Whether the session is still live
// (not revoked) is checked against the database in admin-session.ts.
// Format: base64url(JSON payload) + "." + base64url(signature)
import { SESSION_TTL_SECONDS } from "./constants";

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(text: string): Uint8Array | null {
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export type SessionPayload = { sub: string; sid: string; exp: number };

export const MIN_SECRET_LENGTH = 32;

export async function createSessionToken(
  username: string,
  sessionId: string,
  secret: string,
  now: number = Date.now(),
): Promise<string> {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error("SESSION_SECRET is too short");
  const payload: SessionPayload = { sub: username, sid: sessionId, exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS };
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
  now: number = Date.now(),
): Promise<SessionPayload | null> {
  if (!token || !secret || secret.length < MIN_SECRET_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const sigBytes = b64urlDecode(sig);
  if (!sigBytes) return null;
  // subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    sigBytes as BufferSource,
    enc.encode(body),
  );
  if (!valid) return null;
  const bodyBytes = b64urlDecode(body);
  if (!bodyBytes) return null;
  try {
    const payload = JSON.parse(dec.decode(bodyBytes)) as SessionPayload;
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string" || typeof payload.exp !== "number") {
      return null;
    }
    if (payload.exp * 1000 <= now) return null;
    return payload;
  } catch {
    return null;
  }
}
