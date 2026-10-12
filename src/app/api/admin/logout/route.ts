import type { NextRequest } from "next/server";
import { revokeAdminSession } from "@/lib/admin-session";
import { getAuthConfig } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { guardWrite, json } from "@/lib/http";

export async function POST(request: NextRequest) {
  const blocked = guardWrite(request);
  if (blocked) return blocked;

  // Revoke server-side, so a copied cookie stops working too.
  const config = getAuthConfig();
  if (config) await revokeAdminSession(getDb(), request.cookies.get(SESSION_COOKIE)?.value, config.secret);

  const response = json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
