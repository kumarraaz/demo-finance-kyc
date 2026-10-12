import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/auth";
import { LOGIN_MAX_GLOBAL, LOGIN_MAX_PER_IP, SESSION_COOKIE } from "@/lib/constants";
import { createPrismaClient } from "@/lib/db";
import { createTestDb, hasTestDb, type TestDb } from "./helpers/test-db";

const ORIGIN = "http://localhost:3000";
const PASSWORD = "test-password-123";

type Ctx = { params: Promise<{ id: string }> };
let t: TestDb;
let login: { POST: (r: NextRequest) => Promise<Response> };
let logout: { POST: (r: NextRequest) => Promise<Response> };
let apps: { GET: (r: NextRequest) => Promise<Response>; POST: (r: NextRequest) => Promise<Response> };
let appById: { GET: (r: NextRequest, c: Ctx) => Promise<Response> };
let statusRoute: { POST: (r: NextRequest, c: Ctx) => Promise<Response> };
let health: { GET: () => Promise<Response> };
let proxy: (r: NextRequest) => Promise<Response>;
let cookie = "";
let ipCounter = 0;
const freshIp = () => `198.51.100.${++ipCounter}`;

type Init = { method?: string; body?: unknown; origin?: string | null; cookie?: string; ip?: string; type?: string | null; headers?: Record<string, string> };
function req(url: string, init: Init = {}) {
  const headers = new Headers();
  if (init.type !== null) headers.set("content-type", init.type ?? "application/json");
  if (init.origin !== null) headers.set("origin", init.origin ?? ORIGIN);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.ip) headers.set("x-forwarded-for", init.ip);
  for (const [k, v] of Object.entries(init.headers ?? {})) headers.set(k, v);
  return new NextRequest(`${ORIGIN}${url}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
}
const ctx = (id: string): Ctx => ({ params: Promise.resolve({ id }) });
const valid = { applicantName: "Asha Verma", email: "asha@example.com", loanProduct: "personal", requestedAmount: 50000 };
const doLogin = (password = PASSWORD, ip = freshIp()) =>
  login.POST(req("/api/admin/login", { method: "POST", ip, body: { username: "admin", password } }));
const cookieFrom = (res: Response) => res.headers.get("set-cookie")!.split(";")[0];

describe.skipIf(!hasTestDb)("HTTP layer against PostgreSQL", () => {
  beforeAll(async () => {
    t = await createTestDb();
    (globalThis as unknown as { __demoKycDb: unknown }).__demoKycDb = t.db;
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD_HASH = await hashPassword(PASSWORD);
    process.env.SESSION_SECRET = "s".repeat(48);
    login = await import("@/app/api/admin/login/route");
    logout = await import("@/app/api/admin/logout/route");
    apps = await import("@/app/api/admin/applications/route");
    appById = await import("@/app/api/admin/applications/[id]/route");
    statusRoute = await import("@/app/api/admin/applications/[id]/status/route");
    health = await import("@/app/api/health/route");
    proxy = (await import("@/proxy")).proxy as typeof proxy;
  });
  afterAll(async () => {
    delete (globalThis as unknown as { __demoKycDb?: unknown }).__demoKycDb;
    await t.cleanup();
  });

  describe("login", () => {
    it("rejects wrong credentials without setting a cookie", async () => {
      const res = await doLogin("nope");
      expect(res.status).toBe(401);
      expect(res.headers.get("set-cookie")).toBeNull();
    });
    it("rejects cross-origin, origin-less and cross-site (Sec-Fetch-Site) posts", async () => {
      const body = { username: "admin", password: PASSWORD };
      expect((await login.POST(req("/api/admin/login", { method: "POST", body, origin: "https://evil.example" }))).status).toBe(403);
      expect((await login.POST(req("/api/admin/login", { method: "POST", body, origin: null }))).status).toBe(403);
      expect((await login.POST(req("/api/admin/login", { method: "POST", body, headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403);
      expect((await login.POST(req("/api/admin/login", { method: "POST", body, headers: { "sec-fetch-site": "same-site" } }))).status).toBe(403);
    });
    it("rejects form-encoded posts (415) and malformed bodies (400)", async () => {
      expect((await login.POST(req("/api/admin/login", { method: "POST", type: "application/x-www-form-urlencoded", body: "username=admin&password=x" }))).status).toBe(415);
      expect((await login.POST(req("/api/admin/login", { method: "POST", type: null, body: "{}" }))).status).toBe(415);
      expect((await login.POST(req("/api/admin/login", { method: "POST", ip: freshIp(), body: { username: 1 } }))).status).toBe(400);
    });
    it("issues an HttpOnly, SameSite=Strict cookie on success and stores a server-side session", async () => {
      const res = await doLogin();
      expect(res.status).toBe(200);
      const set = res.headers.get("set-cookie")!;
      expect(set).toMatch(/HttpOnly/i);
      expect(set).toMatch(/SameSite=strict/i);
      expect(set).toMatch(/Path=\//);
      expect(set).not.toMatch(/Domain=/i);
      cookie = cookieFrom(res);
      expect(cookie.startsWith(`${SESSION_COOKIE}=`)).toBe(true);
      expect(await t.db.adminSession.count({ where: { revokedAt: null } })).toBeGreaterThanOrEqual(1);
    });
    it("never reflects the password or hash in any response", async () => {
      const res = await doLogin("wrong-but-distinctive-string");
      expect(await res.text()).not.toMatch(/wrong-but-distinctive-string|scrypt/);
    });
  });

  describe("login rate limiting (shared, Postgres-backed)", () => {
    it(`blocks the IP after ${LOGIN_MAX_PER_IP} attempts with 429 + Retry-After, even for the right password`, async () => {
      const ip = freshIp();
      for (let i = 0; i < LOGIN_MAX_PER_IP; i++) expect((await doLogin("bad", ip)).status).toBe(401);
      const blocked = await doLogin(PASSWORD, ip);
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(blocked.headers.get("set-cookie")).toBeNull();
    });
    it("does not block a different IP", async () => {
      expect((await doLogin(PASSWORD, freshIp())).status).toBe(200);
    });
    it("a successful login resets that IP's counter", async () => {
      const ip = freshIp();
      for (let i = 0; i < LOGIN_MAX_PER_IP - 1; i++) await doLogin("bad", ip);
      expect((await doLogin(PASSWORD, ip)).status).toBe(200);
      for (let i = 0; i < LOGIN_MAX_PER_IP; i++) expect((await doLogin("bad", ip)).status).toBe(401);
    });
    it("a spoofed x-real-ip cannot be used to dodge the per-IP limit", async () => {
      const ip = freshIp();
      for (let i = 0; i < LOGIN_MAX_PER_IP; i++) expect((await doLogin("bad", ip)).status).toBe(401);
      const rotated = await login.POST(
        req("/api/admin/login", { method: "POST", ip, headers: { "x-real-ip": "10.9.8.7" }, body: { username: "admin", password: PASSWORD } }),
      );
      expect(rotated.status).toBe(429);
    });
    it("stores a hash of the IP, never the raw address", async () => {
      const ip = "203.0.113.77";
      await doLogin("bad", ip);
      const keys = (await t.db.rateLimit.findMany()).map((r) => r.key);
      expect(keys.some((k) => k.includes("203.0.113"))).toBe(false);
      expect(keys.some((k) => /^login:ip:[0-9a-f]{32}$/.test(k))).toBe(true);
    });
  });

  describe("authentication enforcement", () => {
    it("API returns 401 without a session", async () => {
      expect((await apps.GET(req("/api/admin/applications"))).status).toBe(401);
      expect((await apps.POST(req("/api/admin/applications", { method: "POST", body: valid }))).status).toBe(401);
      expect((await appById.GET(req("/api/admin/applications/1"), ctx("1"))).status).toBe(401);
      expect((await statusRoute.POST(req("/api/admin/applications/1/status", { method: "POST", body: {} }), ctx("1"))).status).toBe(401);
    });
    it("API rejects forged and wrong-secret cookies", async () => {
      expect((await apps.GET(req("/api/admin/applications", { cookie: `${SESSION_COOKIE}=forged.value` }))).status).toBe(401);
      const { createSessionToken } = await import("@/lib/session");
      const wrongSecret = await createSessionToken("admin", "any-sid", "w".repeat(48));
      expect((await apps.GET(req("/api/admin/applications", { cookie: `${SESSION_COOKIE}=${wrongSecret}` }))).status).toBe(401);
    });
    it("proxy blocks admin pages and APIs, allows login, and passes a validly signed cookie", async () => {
      const page = await proxy(new NextRequest(`${ORIGIN}/admin`));
      expect(page.status).toBe(307);
      expect(page.headers.get("location")).toContain("/admin/login");
      const nested = await proxy(new NextRequest(`${ORIGIN}/admin/applications/1`));
      expect(nested.status).toBe(307);
      expect((await proxy(new NextRequest(`${ORIGIN}/api/admin/applications`))).status).toBe(401);
      expect((await proxy(new NextRequest(`${ORIGIN}/admin/login`))).headers.get("x-middleware-next")).toBe("1");
      expect((await proxy(new NextRequest(`${ORIGIN}/admin`, { headers: { cookie } }))).headers.get("x-middleware-next")).toBe("1");
    });
    it("does not treat look-alike paths as public", async () => {
      for (const p of ["/admin/login/../applications", "/admin/loginx", "/api/admin/login/x"]) {
        const res = await proxy(new NextRequest(`${ORIGIN}${p}`));
        expect(res.headers.get("x-middleware-next")).not.toBe("1");
      }
    });
  });

  describe("CSP on pages (proxy)", () => {
    it("sets a nonce-based CSP, forwards the same nonce to the app, and uses a new nonce per request", async () => {
      const a = await proxy(new NextRequest(`${ORIGIN}/`));
      const b = await proxy(new NextRequest(`${ORIGIN}/`));
      const csp = a.headers.get("content-security-policy")!;
      const nonce = /'nonce-([^']+)'/.exec(csp)![1];
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain("unsafe-inline");
      expect(a.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
      expect(a.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
      expect(/'nonce-([^']+)'/.exec(b.headers.get("content-security-policy")!)![1]).not.toBe(nonce);
    });
    it("also covers the protected admin pages once authenticated", async () => {
      const res = await proxy(new NextRequest(`${ORIGIN}/admin`, { headers: { cookie } }));
      expect(res.headers.get("content-security-policy")).toContain("nonce-");
    });
  });

  describe("applications API", () => {
    it("rejects writes without Origin, with a foreign Origin, or as form posts, even when logged in", async () => {
      expect((await apps.POST(req("/api/admin/applications", { method: "POST", body: valid, cookie, origin: null }))).status).toBe(403);
      expect((await apps.POST(req("/api/admin/applications", { method: "POST", body: valid, cookie, origin: "https://evil.example" }))).status).toBe(403);
      expect((await apps.POST(req("/api/admin/applications", { method: "POST", body: "a=b", cookie, type: "application/x-www-form-urlencoded" }))).status).toBe(415);
      expect(await t.db.application.count()).toBe(0);
    });
    it("rejects PAN/Aadhaar-like data with field errors and stores nothing", async () => {
      const res = await apps.POST(req("/api/admin/applications", { method: "POST", cookie, body: { ...valid, purpose: "my PAN ABCDE1234F" } }));
      expect(res.status).toBe(422);
      expect((await res.json()).error.fields.purpose).toMatch(/PAN or Aadhaar/);
      expect(await t.db.application.count()).toBe(0);
    });
    it("rejects invalid JSON", async () => {
      expect((await apps.POST(req("/api/admin/applications", { method: "POST", cookie, body: "{not json" }))).status).toBe(400);
    });
    it("creates, lists, reads and records status history end to end", async () => {
      const created = await apps.POST(req("/api/admin/applications", { method: "POST", cookie, body: valid }));
      expect(created.status).toBe(201);
      const { application } = await created.json();
      expect(application).toMatchObject({ status: "submitted", isSimulated: true });
      expect(application.reference).toMatch(/^DEMO-\d{6}$/);

      const list = await (await apps.GET(req("/api/admin/applications?status=submitted", { cookie }))).json();
      expect(list.total).toBe(1);
      expect(list.counts.submitted).toBe(1);

      const bad = await statusRoute.POST(
        req(`/api/admin/applications/${application.id}/status`, { method: "POST", cookie, body: { toStatus: "simulated_check_passed" } }),
        ctx(String(application.id)),
      );
      expect(bad.status).toBe(409);

      const ok = await statusRoute.POST(
        req(`/api/admin/applications/${application.id}/status`, { method: "POST", cookie, body: { toStatus: "in_review", note: "starting" } }),
        ctx(String(application.id)),
      );
      expect(ok.status).toBe(200);

      const detail = await (await appById.GET(req(`/api/admin/applications/${application.id}`, { cookie }), ctx(String(application.id)))).json();
      expect(detail.application.status).toBe("in_review");
      expect(detail.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(["in_review", "submitted"]);
      expect(detail.history[0].changedBy).toBe("admin");
    });
    it("validates ids, query strings and missing records", async () => {
      expect((await appById.GET(req("/api/admin/applications/abc", { cookie }), ctx("abc"))).status).toBe(400);
      expect((await appById.GET(req("/api/admin/applications/0", { cookie }), ctx("0"))).status).toBe(400);
      expect((await appById.GET(req("/api/admin/applications/999999", { cookie }), ctx("999999"))).status).toBe(404);
      expect((await apps.GET(req("/api/admin/applications?pageSize=9999", { cookie }))).status).toBe(400);
      expect((await statusRoute.POST(req("/api/admin/applications/999999/status", { method: "POST", cookie, body: { toStatus: "in_review" } }), ctx("999999"))).status).toBe(404);
    });
    it("requires a note when failing the simulated check", async () => {
      const { id } = (await t.db.application.findFirstOrThrow({ select: { id: true } }));
      const res = await statusRoute.POST(
        req(`/api/admin/applications/${id}/status`, { method: "POST", cookie, body: { toStatus: "simulated_check_failed" } }),
        ctx(String(id)),
      );
      expect(res.status).toBe(422);
    });
    it("does not leak internals on a database error", async () => {
      const g = globalThis as unknown as { __demoKycDb: unknown };
      const good = g.__demoKycDb;
      g.__demoKycDb = createPrismaClient("postgresql://u:secret-pw@127.0.0.1:1/none");
      try {
        const res = await health.GET();
        const text = await res.text();
        expect(res.status).toBe(503);
        expect(text).not.toMatch(/secret-pw|127\.0\.0\.1|postgresql/);
      } finally {
        g.__demoKycDb = good;
      }
    });
  });

  describe("logout and session revocation", () => {
    it("logout revokes the session server-side: the copied cookie stops working", async () => {
      const mine = cookieFrom(await doLogin());
      expect((await apps.GET(req("/api/admin/applications", { cookie: mine }))).status).toBe(200);
      const out = await logout.POST(req("/api/admin/logout", { method: "POST", cookie: mine }));
      expect(out.status).toBe(200);
      expect(out.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
      expect((await apps.GET(req("/api/admin/applications", { cookie: mine }))).status).toBe(401);
      // The proxy only checks the signature (optimistic), so it still lets the request through.
      // The route handler's database check is what denies it.
      expect((await proxy(new NextRequest(`${ORIGIN}/api/admin/applications`, { headers: { cookie: mine } }))).headers.get("x-middleware-next")).toBe("1");
    });
    it("logout is also protected against cross-origin requests", async () => {
      expect((await logout.POST(req("/api/admin/logout", { method: "POST", cookie, origin: "https://evil.example" }))).status).toBe(403);
      expect((await apps.GET(req("/api/admin/applications", { cookie }))).status).toBe(200);
    });
    it("an expired server-side session is rejected even with a valid signature", async () => {
      const mine = cookieFrom(await doLogin());
      await t.db.$executeRaw`UPDATE admin_sessions SET expires_at = now() - interval '1 second'`;
      expect((await apps.GET(req("/api/admin/applications", { cookie: mine }))).status).toBe(401);
      cookie = cookieFrom(await doLogin()); // restore a working session for later tests
    });
  });

  describe("health", () => {
    it("reports ok with the database up, and says nothing sensitive", async () => {
      const res = await health.GET();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ok", database: "up", schema: "ok", mode: "demo", verification: "simulated" });
    });
  });

  describe("health on an un-migrated database", () => {
    it("reports degraded/503 (not ok) when the database is reachable but has no tables", async () => {
      const { newSchemaName, withPgClient, dropSchema } = await import("./helpers/test-db");
      const empty = newSchemaName();
      await withPgClient((c) => c.query(`CREATE SCHEMA "${empty}"`));
      const g = globalThis as unknown as { __demoKycDb: unknown };
      const good = g.__demoKycDb;
      const bare = createPrismaClient(t.url, { schema: empty, maxConnections: 2 });
      g.__demoKycDb = bare;
      try {
        const res = await health.GET();
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ status: "degraded", database: "up", schema: "missing", mode: "demo", verification: "simulated" });
      } finally {
        g.__demoKycDb = good;
        await bare.$disconnect();
        await dropSchema(empty);
      }
    });
  });

  describe("global login limit (distributed guessing)", () => {
    it(`blocks everyone after ${LOGIN_MAX_GLOBAL} attempts in the window, across different IPs`, async () => {
      await t.db.rateLimit.deleteMany();
      for (let i = 0; i < LOGIN_MAX_GLOBAL; i++) expect((await doLogin("bad")).status).toBe(401);
      const blocked = await doLogin(PASSWORD);
      expect(blocked.status).toBe(429);
    });
  });
});
