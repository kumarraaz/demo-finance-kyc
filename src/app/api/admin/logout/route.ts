import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";
import { errorJson, isSameOrigin, json } from "@/lib/http";

export function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return errorJson(403, "bad_origin", "Cross-origin request blocked");
  const response = json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
