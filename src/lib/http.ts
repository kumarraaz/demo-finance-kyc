import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./constants";
import { getAuthConfig } from "./auth";
import { verifySessionToken } from "./session";

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorJson(status: number, code: string, message: string, fields?: Record<string, string>) {
  return json({ error: { code, message, ...(fields ? { fields } : {}) } }, status);
}

// CSRF defence for cookie-authenticated writes, on top of SameSite=Strict:
// the Origin header must be present and match the request's own origin.
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === request.nextUrl.origin;
}

export async function getAdminSession(request: NextRequest): Promise<string | null> {
  const config = getAuthConfig();
  if (!config) return null;
  const payload = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, config.secret);
  return payload && payload.sub === config.username ? payload.sub : null;
}

export async function readJson(request: NextRequest): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function parseId(raw: string): number | null {
  return /^\d{1,9}$/.test(raw) ? Number(raw) : null;
}
