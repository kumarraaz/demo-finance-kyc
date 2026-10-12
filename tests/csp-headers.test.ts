import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce } from "@/lib/csp";
import nextConfig from "../next.config";

describe("CSP builder", () => {
  const prod = buildCsp("abc123", false);
  const directive = (name: string) => prod.split("; ").find((d) => d.startsWith(name + " ") || d === name);

  it("uses a per-request nonce with strict-dynamic and no unsafe-inline/unsafe-eval in production", () => {
    expect(directive("script-src")).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(prod).not.toContain("unsafe-inline");
    expect(prod).not.toContain("unsafe-eval");
  });
  it("locks down framing, plugins, base URI, form targets and connections", () => {
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("base-uri")).toBe("base-uri 'none'");
    expect(directive("form-action")).toBe("form-action 'self'");
    expect(directive("connect-src")).toBe("connect-src 'self'");
    expect(directive("default-src")).toBe("default-src 'self'");
  });
  it("allows no remote origins at all", () => {
    expect(prod).not.toMatch(/https?:\/\//);
    expect(prod).not.toContain("*");
  });
  it("upgrades insecure requests in production but not in dev; dev alone gets unsafe-eval", () => {
    expect(prod).toContain("upgrade-insecure-requests");
    const dev = buildCsp("abc123", true);
    expect(dev).not.toContain("upgrade-insecure-requests");
    expect(dev).toContain("'unsafe-eval'");
  });
  it("generates unpredictable, unique nonces", () => {
    const nonces = new Set(Array.from({ length: 200 }, generateNonce));
    expect(nonces.size).toBe(200);
    for (const n of nonces) expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("static security headers (next.config.ts)", () => {
  it("sets the hardening headers on pages and a locked-down CSP on APIs", async () => {
    const rules = await nextConfig.headers!();
    const pages = Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]));
    expect(pages["X-Frame-Options"]).toBe("DENY");
    expect(pages["X-Content-Type-Options"]).toBe("nosniff");
    expect(pages["Referrer-Policy"]).toBe("no-referrer");
    expect(pages["Strict-Transport-Security"]).toMatch(/max-age=\d{8,}/);
    expect(pages["Permissions-Policy"]).toContain("camera=()");
    expect(pages["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(pages["Cache-Control"]).toBe("no-store");
    const api = rules.find((r) => r.source === "/api/:path*")!;
    expect(api.headers[0].value).toBe("default-src 'none'; frame-ancestors 'none'");
  });
  it("does not apply no-store to immutable build assets", async () => {
    const rules = await nextConfig.headers!();
    expect(rules[0].source).toContain("_next/static");
    expect(rules[0].source.startsWith("/((?!")).toBe(true);
  });
  it("hides the framework header", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
