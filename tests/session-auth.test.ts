import { describe, expect, it } from "vitest";
import { LoginLimiter, getAuthConfig, hashPassword, verifyPassword } from "@/lib/auth";
import { createSessionToken, verifySessionToken } from "@/lib/session";

const SECRET = "x".repeat(40);

describe("session tokens", () => {
  it("round-trips", async () => {
    const t = await createSessionToken("admin", SECRET);
    expect(await verifySessionToken(t, SECRET)).toMatchObject({ sub: "admin" });
  });
  it("rejects a wrong secret", async () => {
    const t = await createSessionToken("admin", SECRET);
    expect(await verifySessionToken(t, "y".repeat(40))).toBeNull();
  });
  it("rejects a tampered payload", async () => {
    const t = await createSessionToken("admin", SECRET);
    const [, sig] = t.split(".");
    const forged = btoa(JSON.stringify({ sub: "root", exp: 9999999999 })).replace(/=+$/, "");
    expect(await verifySessionToken(`${forged}.${sig}`, SECRET)).toBeNull();
  });
  it("rejects expired tokens", async () => {
    const t = await createSessionToken("admin", SECRET, Date.now() - 24 * 3600 * 1000);
    expect(await verifySessionToken(t, SECRET)).toBeNull();
  });
  it("rejects garbage, missing values and short secrets", async () => {
    for (const bad of [undefined, "", "abc", "a.b.c", "!!!.???"]) {
      expect(await verifySessionToken(bad, SECRET)).toBeNull();
    }
    await expect(createSessionToken("admin", "short")).rejects.toThrow();
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

describe("LoginLimiter", () => {
  it("blocks after max failures and unblocks after the window or reset", () => {
    const l = new LoginLimiter(3, 1000);
    for (let i = 0; i < 3; i++) l.recordFailure("ip", 0);
    expect(l.isBlocked("ip", 500)).toBe(true);
    expect(l.isBlocked("ip", 1500)).toBe(false);
    for (let i = 0; i < 3; i++) l.recordFailure("ip", 2000);
    l.reset("ip");
    expect(l.isBlocked("ip", 2001)).toBe(false);
  });
});
