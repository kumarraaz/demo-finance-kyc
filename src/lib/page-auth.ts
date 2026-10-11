import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateAdminSession } from "./admin-session";
import { getAuthConfig } from "./auth";
import { SESSION_COOKIE } from "./constants";
import { getDb } from "./db";

// Pages re-check the session (including revocation) even though the proxy
// already verified the cookie signature.
export async function requireAdminPage(): Promise<string> {
  const config = getAuthConfig();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = config ? await validateAdminSession(getDb(), token, config.secret, config.username) : null;
  if (!user) redirect("/admin/login");
  return user;
}
