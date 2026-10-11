import { describe, expect, it } from "vitest";
import { clientIp, getAuthConfig, hashForKey, hashPassword, verifyPassword } from "@/lib/auth";
import { createSessionToken, verifySessionToken } from "@/lib/session";

const SECRET = "x".repeat(40);

describe("session tokens", () => {
  it("round-trips", async () => {
    const t = await createSessionToken("admin", "sid-1", SECRET);
    expect(await verifySessionToken(t, SECRET)).toMatchObject({ sub: "admin", sid: "sid-1" });
  });
  it("rejects a wrong secret", async () => {
    const t = await createSessionToken("admin", "sid-1", SECRET);
    expect(await verifySessionToken(t, "y".repeat(40))).toBeNull();
  });
  it("rejects a tampered payload", async () => {
    const t = await createSessionToken("admin", "sid-1", SECRET);
    const [, sig] = t.split(".");
    const forged = btoa(JSON.stringify({ sub: "root", sid: "sid-1", exp: 9999999999 })).replace(/=+$/, "");
    expect(await verifySessionToken(`${forged}.${sig}`, SECRET)).toBeNull();
  });
  it("rejects expired tokens", async () => {
    const t = await createSessionToken("admin", "sid-1", SECRET, Date.now() - 24 * 3600 * 1000);
    expect(await verifySessionToken(t, SECRET)).toBeNull();
  });
  it("rejects tokens that are missing the session id", async () => {
    const body = btoa(JSON.stringify({ sub: "admin", exp: 9999999999 })).replace(/=+$/, "");
    expect(await verifySessionToken(`${body}.AAAA`, SECRET)).toBeNull();
  });
  it("rejects garbage, missing values and short secrets", async () => {
    for (const bad of [undefined, "", "abc", "a.b.c", "!!!.???"]) {
      expect(await verifySessionToken(bad, SECRET)).toBeNull();
    }
    await expect(createSessionToken("admin", "sid-1", "short")).rejects.toThrow();
    expect(await verifySessionToken("a.b", "short")).toBeNull();
  });
});

describe("passwords", () => {
  it("verifies the right password only", async () => {
    const h = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
  it("uses a fresh salt each time", async () => {
    expect(await hashPassword("same-password-1")).not.toBe(await hashPassword("same-password-1"));
  });
  it("rejects malformed stored hashes", async () => {
    for (const bad of ["", "plain", "scrypt$zz$zz", "md5$aa$bb"]) expect(await verifyPassword("x", bad)).toBe(false);
  });
});

describe("auth config", () => {
  it("is null unless everything is set and the secret is long enough", () => {
    expect(getAuthConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(getAuthConfig({ ADMIN_USERNAME: "a", ADMIN_PASSWORD_HASH: "h", SESSION_SECRET: "short" } as never)).toBeNull();
    expect(getAuthConfig({ ADMIN_USERNAME: "a", ADMIN_PASSWORD_HASH: "h", SESSION_SECRET: SECRET } as never)).toEqual({
      username: "a",
      passwordHash: "h",
      secret: SECRET,
    });
  });
});

describe("client identity for rate limiting", () => {
  it("trusts the first x-forwarded-for entry (overwritten by Vercel), only then x-real-ip, then 'unknown'", () => {
    // A client-supplied x-real-ip must never override the platform-set x-forwarded-for.
    expect(clientIp(new Headers({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers({ "x-real-ip": "1.1.1.1" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers())).toBe("unknown");
  });
  it("hashes identifiers so raw IPs are never stored, and the hash depends on the secret", () => {
    const a = hashForKey("203.0.113.9", SECRET);
    expect(a).not.toContain("203");
    expect(a).toBe(hashForKey("203.0.113.9", SECRET));
    expect(a).not.toBe(hashForKey("203.0.113.9", "y".repeat(40)));
    expect(a).not.toBe(hashForKey("203.0.113.10", SECRET));
  });
});
