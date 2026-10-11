import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthConfig } from "./auth";
import { SESSION_COOKIE } from "./constants";
import { verifySessionToken } from "./session";

// Pages re-check the session even though the proxy already did.
export async function requireAdminPage(): Promise<string> {
  const config = getAuthConfig();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = config ? await verifySessionToken(token, config.secret) : null;
  if (!payload || payload.sub !== config?.username) redirect("/admin/login");
  return payload.sub;
}
