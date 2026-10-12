// Runtime smoke test for a DEPLOYED instance (Preview or Production). Run it from YOUR machine
// so the admin password never has to be shared with anyone or anything else.
//
//   node scripts/smoke-deployment.mjs https://<deployment-url> [--write]
//
// Credentials (needed for the login checks):
//   SMOKE_ADMIN_USERNAME  - or you are asked for it
//   SMOKE_ADMIN_PASSWORD  - or you are asked for it with hidden input
// If Vercel Deployment Protection is on:
//   VERCEL_AUTOMATION_BYPASS_SECRET - sent as the x-vercel-protection-bypass header
//
// Read-only by default. --write also creates ONE fictional demo application and moves it to
// "in review" (it stays in the database; the audit trail is append-only by design).
// Prints PASS/FAIL per check. It never prints the password, cookies, or any secret.
import { createInterface } from "node:readline/promises";
import { randomBytes } from "node:crypto";
import { stdin, stderr } from "node:process";
import { readSecret } from "./lib/prompt.mjs";

/** Validate the attributes of the session cookie the server sets on login. Pure, unit-tested. */
export function checkSessionCookie(setCookie, { https }) {
  const problems = [];
  const parts = setCookie.split(";").map((p) => p.trim());
  const [pair, ...attrs] = parts;
  const name = pair.split("=")[0];
  const lower = attrs.map((a) => a.toLowerCase());
  if (!/^(__Host-)?dfk_admin_session$/.test(name)) problems.push(`unexpected cookie name "${name}"`);
  if (https && name !== "__Host-dfk_admin_session") problems.push("production cookie must use the __Host- prefix");
  if (!lower.includes("httponly")) problems.push("missing HttpOnly");
  if (https && !lower.includes("secure")) problems.push("missing Secure");
  if (!lower.includes("samesite=strict")) problems.push("SameSite is not Strict");
  if (!lower.includes("path=/")) problems.push("Path is not /");
  if (lower.some((a) => a.startsWith("domain="))) problems.push("must not set a Domain");
  const maxAge = lower.find((a) => a.startsWith("max-age="));
  if (!maxAge || Number(maxAge.split("=")[1]) > 8 * 3600) problems.push("lifetime missing or longer than 8 hours");
  return problems;
}

/** Validate security headers on an HTML page. Pure, unit-tested. */
export function checkPageHeaders(get, { https }) {
  const problems = [];
  const csp = get("content-security-policy") ?? "";
  if (!/'nonce-[A-Za-z0-9+/=]+'/.test(csp)) problems.push("CSP has no nonce");
  if (/unsafe-inline|unsafe-eval/.test(csp)) problems.push("CSP allows unsafe-inline/unsafe-eval");
  if (!csp.includes("frame-ancestors 'none'")) problems.push("CSP lacks frame-ancestors 'none'");
  if (get("x-frame-options")?.toUpperCase() !== "DENY") problems.push("X-Frame-Options is not DENY");
  if (get("x-content-type-options")?.toLowerCase() !== "nosniff") problems.push("X-Content-Type-Options is not nosniff");
  if (get("x-powered-by")) problems.push("X-Powered-By is exposed");
  if (https && !/max-age=\d{7,}/.test(get("strict-transport-security") ?? "")) problems.push("HSTS missing or too short");
  return problems;
}

async function main() {
  const args = process.argv.slice(2);
  const base = args.find((a) => !a.startsWith("--"));
  const write = args.includes("--write");
  if (!base || !/^https?:\/\//.test(base)) {
    stderr.write("usage: node scripts/smoke-deployment.mjs https://<deployment-url> [--write]\n");
    process.exit(2);
  }
  const origin = new URL(base).origin;
  const https = origin.startsWith("https://");
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

  let username = process.env.SMOKE_ADMIN_USERNAME;
  let password = process.env.SMOKE_ADMIN_PASSWORD;
  if (!username || !password) {
    if (!stdin.isTTY) {
      stderr.write("Set SMOKE_ADMIN_USERNAME and SMOKE_ADMIN_PASSWORD, or run in a terminal to be prompted.\n");
      process.exit(2);
    }
    if (!username) {
      const rl = createInterface({ input: stdin, output: stderr });
      username = (await rl.question("Admin username: ")).trim();
      rl.close();
    }
    if (!password) password = await readSecret("Admin password (input hidden): ");
  }

  let failures = 0;
  const record = (name, ok, detail = "") => {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  };
  const headers = (extra = {}) => ({ ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}), ...extra });
  const req = (path, init = {}) => fetch(origin + path, { redirect: "manual", ...init, headers: headers(init.headers) });
  const post = (path, body, cookie, originHeader = origin) =>
    req(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: originHeader, ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });
  const json = async (res) => res.json().catch(() => null);
  const protectedByVercel = (res) => res.status === 401 && /vercel/i.test(res.headers.get("server") ?? "") && !res.headers.get("content-type")?.includes("json");

  console.log(`Smoke test: ${origin}  (${write ? "with writes" : "read-only"})\n`);

  // 1. health
  const health = await req("/api/health");
  if (protectedByVercel(health)) {
    record("deployment reachable", false, "Vercel Deployment Protection is blocking requests; set VERCEL_AUTOMATION_BYPASS_SECRET");
    process.exit(1);
  }
  const hb = await json(health);
  record("health: database up, schema migrated", health.status === 200 && hb?.status === "ok" && hb?.database === "up" && hb?.schema === "ok",
    `HTTP ${health.status} ${hb ? `status=${hb.status} database=${hb.database} schema=${hb.schema ?? "-"}` : ""}`);
  record("health: labelled simulated", hb?.verification === "simulated" && hb?.mode === "demo");

  // 2-3. protected routes without a session
  const adminPage = await req("/admin");
  record("unauthenticated /admin redirects to login", adminPage.status >= 300 && adminPage.status < 400 && (adminPage.headers.get("location") ?? "").includes("/admin/login"), `HTTP ${adminPage.status}`);
  const adminApi = await req("/api/admin/applications");
  record("unauthenticated admin API returns 401", adminApi.status === 401, `HTTP ${adminApi.status}`);

  // 4. headers
  const loginPage = await req("/admin/login");
  const headerProblems = checkPageHeaders((h) => loginPage.headers.get(h), { https });
  record("security headers on the login page", loginPage.status === 200 && headerProblems.length === 0, headerProblems.join("; ") || `HTTP ${loginPage.status}`);

  // 5. cross-origin write refused
  const evil = await post("/api/admin/login", { username: "x", password: "x" }, undefined, "https://evil.example");
  record("cross-origin login attempt is refused", evil.status === 403, `HTTP ${evil.status}`);

  // 6. wrong password (one attempt only: login is rate limited)
  const wrong = await post("/api/admin/login", { username, password: `wrong-${randomBytes(6).toString("hex")}-x` });
  const wb = await json(wrong);
  record("wrong password is rejected (401, generic message)", wrong.status === 401 && wb?.error?.code === "invalid_credentials",
    wrong.status === 503 ? "503 not_configured: ADMIN_* / SESSION_SECRET missing or malformed on this deployment" : `HTTP ${wrong.status}`);

  // 7. correct login
  const login = await post("/api/admin/login", { username, password });
  record("login with the real credentials succeeds", login.status === 200, `HTTP ${login.status}${login.status === 429 ? " (rate limited; wait 15 minutes)" : ""}`);
  let cookie;
  if (login.status === 200) {
    const setCookie = login.headers.getSetCookie?.()[0] ?? "";
    const problems = checkSessionCookie(setCookie, { https });
    record("session cookie attributes", problems.length === 0, problems.join("; "));
    cookie = setCookie.split(";")[0];
  }

  if (cookie) {
    // 8. authenticated access
    const apps = await req("/api/admin/applications", { headers: { Cookie: cookie } });
    record("authenticated admin API returns 200", apps.status === 200, `HTTP ${apps.status}`);
    const page = await req("/admin", { headers: { Cookie: cookie } });
    record("authenticated /admin renders", page.status === 200, `HTTP ${page.status}`);

    // 9. optional write path
    if (write) {
      const created = await post("/api/admin/applications", { applicantName: "Smoke Test", email: "smoke@example.com", loanProduct: "personal", requestedAmount: 1000, purpose: "deployment smoke test (fictional)" }, cookie);
      const cb = await json(created);
      record("create a fictional demo application", created.status === 201 && cb?.application?.isSimulated === true, `HTTP ${created.status}`);
      if (created.status === 201) {
        const moved = await post(`/api/admin/applications/${cb.application.id}/status`, { toStatus: "in_review", note: "smoke test" }, cookie);
        const mb = await json(moved);
        record("status change recorded in history", moved.status === 200 && mb?.history?.length === 2, `HTTP ${moved.status}`);
      }
    }

    // 10. logout revokes the session server-side
    const out = await post("/api/admin/logout", {}, cookie);
    record("logout succeeds", out.status === 200, `HTTP ${out.status}`);
    const replay = await req("/api/admin/applications", { headers: { Cookie: cookie } });
    record("the old cookie stops working after logout (server-side revocation)", replay.status === 401, `HTTP ${replay.status}`);
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    stderr.write(`Smoke test could not run: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
