import { NextResponse, type NextRequest } from "next/server";
import { getAuthConfig } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";
import { buildCsp, generateNonce } from "@/lib/csp";
import { verifySessionToken } from "@/lib/session";

// Runs on every page and API request (except static assets) to:
//  1. attach a per-request CSP nonce to pages, and
//  2. keep unauthenticated users away from /admin and /api/admin.
//
// This is an OPTIMISTIC check: it verifies the cookie signature and expiry only.
// It deliberately does not query the database. Pages and route handlers perform
// the authoritative check, including server-side revocation.
const PUBLIC_PATHS = new Set(["/admin/login", "/api/admin/login", "/api/admin/logout"]);

function isProtected(pathname: string): boolean {
  return (
    (pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/api/admin" || pathname.startsWith("/api/admin/")) &&
    !PUBLIC_PATHS.has(pathname)
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isProtected(pathname)) {
    const config = getAuthConfig();
    const payload = config
      ? await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, config.secret)
      : null;
    if (!payload || payload.sub !== config?.username) {
      if (isApi) {
        return NextResponse.json(
          { error: { code: "unauthorized", message: "Login required" } },
          { status: 401, headers: { "Cache-Control": "no-store" } },
        );
      }
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  // API responses are JSON; the strictest possible CSP is set in next.config.ts.
  if (isApi) return NextResponse.next();

  const nonce = generateNonce();
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
