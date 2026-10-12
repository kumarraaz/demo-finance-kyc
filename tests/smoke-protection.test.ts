import { spawn } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { isVercelProtection, protectionMessage } from "../scripts/smoke-deployment.mjs";

// Regression for the first real Preview smoke run: Deployment Protection answered with a 302 to
// vercel.com/sso-api (and 401 pages for POSTs), the script only recognised a 401, so it reported eight
// misleading "application" failures (including "correct credentials rejected") although the app was
// never reached. It must now stop with ONE clear message.

const hdr = (h: Record<string, string>) => (n: string) => h[n.toLowerCase()];
const SSO = "https://vercel.com/sso-api?url=https%3A%2F%2Fx.vercel.app%2F&nonce=abc";

describe("isVercelProtection", () => {
  it("recognises the SSO redirect, the SSO cookie and a Vercel 401 page", () => {
    expect(isVercelProtection({ status: 302, get: hdr({ location: SSO }) })).toBe(true);
    expect(isVercelProtection({ status: 307, get: hdr({ location: "https://vercel.com/login?next=/x" }) })).toBe(true);
    expect(isVercelProtection({ status: 200, get: hdr({}), setCookies: ["_vercel_sso_nonce=abc; Path=/; Secure"] })).toBe(true);
    expect(isVercelProtection({ status: 401, get: hdr({ server: "Vercel", "content-type": "text/html" }) })).toBe(true);
  });

  it("does NOT mistake the application's own responses for protection", () => {
    // the app redirects unauthenticated /admin to its own login page
    expect(isVercelProtection({ status: 307, get: hdr({ location: "https://app.example.com/admin/login" }) })).toBe(false);
    expect(isVercelProtection({ status: 307, get: hdr({ location: "/admin/login" }) })).toBe(false);
    // the app answers API calls with JSON, even on Vercel's servers
    expect(isVercelProtection({ status: 401, get: hdr({ server: "Vercel", "content-type": "application/json" }) })).toBe(false);
    expect(isVercelProtection({ status: 200, get: hdr({ server: "Vercel" }), setCookies: ["__Host-dfk_admin_session=x; Path=/"] })).toBe(false);
    expect(isVercelProtection({ status: 403, get: hdr({}) })).toBe(false);
  });

  it("messages differ for 'no secret' and 'secret rejected' and never contain a value", () => {
    expect(protectionMessage({ bypassSent: false })).toMatch(/Set VERCEL_AUTOMATION_BYPASS_SECRET/);
    expect(protectionMessage({ bypassSent: true })).toMatch(/even though VERCEL_AUTOMATION_BYPASS_SECRET was sent/);
  });
});

function run(url: string, env: Record<string, string>) {
  return new Promise<{ code: number | null; out: string }>((resolve) => {
    const child = spawn(process.execPath, ["scripts/smoke-deployment.mjs", url], {
      env: { PATH: process.env.PATH ?? "", SMOKE_ADMIN_USERNAME: "kumarraaz", SMOKE_ADMIN_PASSWORD: "test-only-password-1", ...env } as unknown as NodeJS.ProcessEnv,
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

const servers: http.Server[] = [];
const listen = (handler: http.RequestListener) =>
  new Promise<string>((resolve) => {
    const s = http.createServer(handler).listen(0, "127.0.0.1", () => {
      servers.push(s);
      resolve(`http://127.0.0.1:${(s.address() as AddressInfo).port}`);
    });
  });
afterAll(() => servers.forEach((s) => s.close()));

const protect: http.RequestListener = (req, res) => {
  const base = { server: "Vercel", "x-frame-options": "DENY" };
  if (req.method === "GET") {
    res.writeHead(302, { ...base, location: SSO, "set-cookie": "_vercel_sso_nonce=abc; Path=/; Secure" });
    return res.end();
  }
  res.writeHead(401, { ...base, "content-type": "text/html" });
  res.end("<html>Authentication Required</html>");
};

describe("smoke-deployment against a protected deployment", () => {
  it("stops with one clear FAIL and does not report fake application failures", async () => {
    const url = await listen(protect);
    const r = await run(url, {});
    expect(r.code).toBe(1);
    expect(r.out.match(/^FAIL/gm)).toHaveLength(1);
    expect(r.out).toMatch(/Deployment Protection, not the application/);
    expect(r.out).toMatch(/Set VERCEL_AUTOMATION_BYPASS_SECRET/);
    for (const misleading of ["login with the real credentials", "wrong password is rejected", "security headers on the login page"]) {
      expect(r.out).not.toContain(misleading);
    }
  });

  it("says so when a bypass secret WAS sent but is rejected, and never prints it", async () => {
    const url = await listen(protect);
    const secret = "bypass-secret-do-not-print-123";
    const r = await run(url, { VERCEL_AUTOMATION_BYPASS_SECRET: secret });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/even though VERCEL_AUTOMATION_BYPASS_SECRET was sent/);
    expect(r.out).not.toContain(secret);
    expect(r.out).not.toContain("test-only-password-1");
  });

  it("sends the bypass header on every request, and gets past protection when it is accepted", async () => {
    const secret = "bypass-secret-do-not-print-456";
    const seen: (string | undefined)[] = [];
    const url = await listen((req, res) => {
      const sent = req.headers["x-vercel-protection-bypass"] as string | undefined;
      seen.push(sent);
      if (sent !== secret) return protect(req, res);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", database: "up", schema: "ok", mode: "demo", verification: "simulated" }));
    });
    const r = await run(url, { VERCEL_AUTOMATION_BYPASS_SECRET: secret });
    expect(r.out).toMatch(/PASS {2}health: database up, schema migrated/);
    expect(r.out).not.toMatch(/Deployment Protection/);
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.every((s) => s === secret)).toBe(true);
    expect(r.out).not.toContain(secret);
  });
});
