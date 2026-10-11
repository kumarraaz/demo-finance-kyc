import type { NextRequest } from "next/server";
import { loginLimiter, getAuthConfig, safeEqualStrings, verifyPassword } from "@/lib/auth";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/constants";
import { errorJson, isSameOrigin, json, readJson } from "@/lib/http";
import { createSessionToken } from "@/lib/session";
import { loginSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return errorJson(403, "bad_origin", "Cross-origin request blocked");

  const config = getAuthConfig();
  if (!config) return errorJson(503, "not_configured", "Admin login is not configured on this deployment");

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (loginLimiter.isBlocked(ip)) return errorJson(429, "too_many_attempts", "Too many failed attempts. Try later.");

  const parsed = loginSchema.safeParse(await readJson(request));
  if (!parsed.success) return errorJson(400, "invalid_request", "Username and password are required");

  // Always run both checks so timing does not reveal which one failed.
  const userOk = safeEqualStrings(parsed.data.username, config.username);
  const passOk = await verifyPassword(parsed.data.password, config.passwordHash);
  if (!userOk || !passOk) {
    loginLimiter.recordFailure(ip);
    return errorJson(401, "invalid_credentials", "Invalid username or password");
  }

  loginLimiter.reset(ip);
  const token = await createSessionToken(config.username, config.secret);
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
