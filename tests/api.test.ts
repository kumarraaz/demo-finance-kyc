import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/auth";

const ORIGIN = "http://localhost:3000";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dfk-test-"));

type Handler = (req: NextRequest, ctx?: never) => Promise<Response> | Response;
let login: { POST: Handler };
let apps: { GET: Handler; POST: Handler };
let appById: { GET: (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response> };
let statusRoute: { POST: (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response> };
let proxy: (r: NextRequest) => Promise<Response>;
let cookie = "";

function req(url: string, init: { method?: string; body?: unknown; origin?: string | null; cookie?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.origin !== null) headers.set("origin", init.origin ?? ORIGIN);
  if (init.cookie) headers.set("cookie", init.cookie);
  return new NextRequest(`${ORIGIN}${url}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const valid = { applicantName: "Asha Verma", email: "asha@example.com", loanProduct: "personal", requestedAmount: 50000 };

beforeAll(async () => {
  process.env.DATABASE_PATH = path.join(tmp, "test.db");
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD_HASH = await hashPassword("test-password-123");
  process.env.SESSION_SECRET = "s".repeat(48);
  login = await import("@/app/api/admin/login/route");
  apps = await import("@/app/api/admin/applications/route");
  appById = await import("@/app/api/admin/applications/[id]/route");
  statusRoute = await import("@/app/api/admin/applications/[id]/status/route");
  proxy = (await import("@/proxy")).proxy as typeof proxy;
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("login", () => {
  it("rejects wrong credentials without setting a cookie", async () => {
    const res = await login.POST(req("/api/admin/login", { method: "POST", body: { username: "admin", password: "nope" } }));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
  it("rejects cross-origin and origin-less posts", async () => {
    const body = { username: "admin", password: "test-password-123" };
    expect((await login.POST(req("/api/admin/login", { method: "POST", body, origin: "https://evil.example" }))).status).toBe(403);
    expect((await login.POST(req("/api/admin/login", { method: "POST", body, origin: null }))).status).toBe(403);
  });
  it("rejects malformed bodies", async () => {
    expect((await login.POST(req("/api/admin/login", { method: "POST", body: { username: 1 } }))).status).toBe(400);
  });
  it("issues an HttpOnly, SameSite=Strict cookie on success", async () => {
    const res = await login.POST(
      req("/api/admin/login", { method: "POST", body: { username: "admin", password: "test-password-123" } }),
    );
    expect(res.status).toBe(200);
    const set = res.headers.get("set-cookie")!;
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=strict/i);
    cookie = set.split(";")[0];
  });
});

describe("authentication enforcement", () => {
  it("API returns 401 without a session", async () => {
    expect((await apps.GET(req("/api/admin/applications"))).status).toBe(401);
    expect((await apps.POST(req("/api/admin/applications", { method: "POST", body: valid }))).status).toBe(401);
    expect((await appById.GET(req("/api/admin/applications/1"), ctx("1"))).status).toBe(401);
    expect((await statusRoute.POST(req("/api/admin/applications/1/status", { method: "POST", body: {} }), ctx("1"))).status).toBe(401);
  });
  it("API rejects a forged cookie", async () => {
    expect((await apps.GET(req("/api/admin/applications", { cookie: "dfk_admin_session=forged.value" }))).status).toBe(401);
  });
  it("proxy blocks admin pages and APIs, allows login", async () => {
    const page = await proxy(new NextRequest(`${ORIGIN}/admin`));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toContain("/admin/login");
    expect((await proxy(new NextRequest(`${ORIGIN}/api/admin/applications`))).status).toBe(401);
    expect((await proxy(new NextRequest(`${ORIGIN}/admin/login`))).headers.get("x-middleware-next")).toBe("1");
    const authed = await proxy(new NextRequest(`${ORIGIN}/admin`, { headers: { cookie } }));
    expect(authed.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("applications API", () => {
  it("rejects writes without an Origin header even when logged in", async () => {
    const res = await apps.POST(req("/api/admin/applications", { method: "POST", body: valid, cookie, origin: null }));
    expect(res.status).toBe(403);
  });
  it("rejects PAN/Aadhaar-like data with field errors", async () => {
    const res = await apps.POST(req("/api/admin/applications", { method: "POST", cookie, body: { ...valid, purpose: "my PAN ABCDE1234F" } }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.fields.purpose).toMatch(/PAN or Aadhaar/);
  });
  it("rejects invalid JSON", async () => {
    const bad = new NextRequest(`${ORIGIN}/api/admin/applications`, {
      method: "POST",
      headers: { origin: ORIGIN, cookie, "content-type": "application/json" },
      body: "{not json",
    });
    expect((await apps.POST(bad)).status).toBe(400);
  });
  it("creates, lists, reads and records status history end to end", async () => {
    const created = await apps.POST(req("/api/admin/applications", { method: "POST", cookie, body: valid }));
    expect(created.status).toBe(201);
    const { application } = await created.json();
    expect(application).toMatchObject({ reference: "DEMO-000001", status: "submitted", isSimulated: true });

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
  });
  it("validates ids, query strings and missing records", async () => {
    expect((await appById.GET(req("/api/admin/applications/abc", { cookie }), ctx("abc"))).status).toBe(400);
    expect((await appById.GET(req("/api/admin/applications/999", { cookie }), ctx("999"))).status).toBe(404);
    expect((await apps.GET(req("/api/admin/applications?pageSize=9999", { cookie }))).status).toBe(400);
    const missing = await statusRoute.POST(
      req("/api/admin/applications/999/status", { method: "POST", cookie, body: { toStatus: "in_review" } }),
      ctx("999"),
    );
    expect(missing.status).toBe(404);
  });
  it("requires a note when failing the simulated check", async () => {
    const res = await statusRoute.POST(
      req("/api/admin/applications/1/status", { method: "POST", cookie, body: { toStatus: "simulated_check_failed" } }),
      ctx("1"),
    );
    expect(res.status).toBe(422);
  });
});
