import type { NextRequest } from "next/server";
import { startAdminSession } from "@/lib/admin-session";
import { clientIp, getAuthConfig, hashForKey, safeEqualStrings, verifyPassword } from "@/lib/auth";
import {
  LOGIN_MAX_GLOBAL,
  LOGIN_MAX_PER_IP,
  LOGIN_WINDOW_MS,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "@/lib/constants";
import { getDb } from "@/lib/db";
import { errorJson, guardWrite, json, readJson } from "@/lib/http";
import { consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const blocked = guardWrite(request);
  if (blocked) return blocked;

  const config = getAuthConfig();
  if (!config) return errorJson(503, "not_configured", "Admin login is not configured on this deployment");

  const parsed = loginSchema.safeParse(await readJson(request));
  if (!parsed.success) return errorJson(400, "invalid_request", "Username and password are required");

  // Rate limit BEFORE the expensive password check. Every attempt is counted;
  // a success clears the per-IP counter. Backed by Postgres, so it is shared
  // across serverless instances. If the database is down this throws (fail closed).
  const db = getDb();
  const ipKey = `login:ip:${hashForKey(clientIp(request.headers), config.secret)}`;
  const perIp = await consumeRateLimit(db, ipKey, LOGIN_MAX_PER_IP, LOGIN_WINDOW_MS);
  const global = await consumeRateLimit(db, "login:global", LOGIN_MAX_GLOBAL, LOGIN_WINDOW_MS);
  if (!perIp.allowed || !global.allowed) {
    const retry = Math.max(perIp.allowed ? 0 : perIp.retryAfterSeconds, global.allowed ? 0 : global.retryAfterSeconds);
    return json(
      { error: { code: "too_many_attempts", message: "Too many login attempts. Try again later." } },
      429,
      { "Retry-After": String(retry) },
    );
  }

  // Always run both checks so timing does not reveal which one failed.
  const userOk = safeEqualStrings(parsed.data.username, config.username);
  const passOk = await verifyPassword(parsed.data.password, config.passwordHash);
  if (!userOk || !passOk) return errorJson(401, "invalid_credentials", "Invalid username or password");

  await resetRateLimit(db, ipKey);
  const token = await startAdminSession(db, config.username, config.secret);
  const response = json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
