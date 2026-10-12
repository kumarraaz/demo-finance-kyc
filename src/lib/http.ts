import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./constants";
import { getAuthConfig } from "./auth";
import { validateAdminSession } from "./admin-session";
import { getDb } from "./db";

export function json(body: unknown, status = 200, headers?: Record<string, string>): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function errorJson(status: number, code: string, message: string, fields?: Record<string, string>) {
  return json({ error: { code, message, ...(fields ? { fields } : {}) } }, status);
}

// CSRF defence for cookie-authenticated writes, layered on SameSite=Strict:
//  1. If the browser sends Sec-Fetch-Site, it must say same-origin.
//  2. The Origin header must be present and equal this request's own origin.
export function isSameOrigin(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === request.nextUrl.origin;
}

/** Common checks for every state-changing request. Returns an error response, or null if OK. */
export function guardWrite(request: NextRequest): NextResponse | null {
  if (!isSameOrigin(request)) return errorJson(403, "bad_origin", "Cross-origin request blocked");
  // A plain HTML form cannot send application/json, so requiring it blocks form-based CSRF.
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    return errorJson(415, "unsupported_media_type", "Content-Type must be application/json");
  }
  return null;
}

/** Full admin check (signature + live server-side session). Returns the username or null. */
export async function getAdminSession(request: NextRequest): Promise<string | null> {
  const config = getAuthConfig();
  if (!config) return null;
  return validateAdminSession(getDb(), request.cookies.get(SESSION_COOKIE)?.value, config.secret, config.username);
}

export async function readJson(request: NextRequest): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function parseId(raw: string): number | null {
  const id = /^\d{1,9}$/.test(raw) ? Number(raw) : null;
  return id !== null && id > 0 ? id : null;
}
