import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PASSWORD_HASH_PATTERN, verifyPassword } from "@/lib/auth";

const ROOT = path.resolve(__dirname, "..");
const run = (args: string[], input?: string) =>
  spawnSync("node", ["scripts/hash-password.mjs", ...args], { cwd: ROOT, input, encoding: "utf8" });

describe("scripts/hash-password.mjs", () => {
  it("reads the password from stdin and prints only a hash the application accepts", async () => {
    const pw = "a-long-test-password-xyz";
    const r = run([], `${pw}\n`);
    expect(r.status).toBe(0);
    const hash = r.stdout.trim();
    expect(PASSWORD_HASH_PATTERN.test(hash)).toBe(true);
    expect(await verifyPassword(pw, hash)).toBe(true);
    expect(await verifyPassword(`${pw}x`, hash)).toBe(false);
    expect(r.stdout).not.toContain(pw);
    expect(r.stderr).not.toContain(pw);
  });
  it("uses a fresh salt every time", () => {
    const a = run([], "same-password-1234\n").stdout;
    const b = run([], "same-password-1234\n").stdout;
    expect(a).not.toBe(b);
  });
  it("refuses a password passed as an argument (shell history / process list exposure)", () => {
    const pw = "should-never-be-an-argument";
    const r = run([pw]);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/Do not pass the password as an argument/);
    expect(r.stderr).not.toContain(pw);
  });
  it("enforces the same length limits as the login form (12 to 200)", () => {
    expect(run([], "short\n").status).toBe(1);
    expect(run([], `${"a".repeat(201)}\n`).status).toBe(1);
    expect(run([], `${"a".repeat(200)}\n`).status).toBe(0);
    expect(run([], `${"a".repeat(12)}\n`).status).toBe(0);
  });
});

describe("documentation does not teach the unsafe command", () => {
  const files = ["README.md", "docs/DEPLOYMENT.md", ".env.example", "package.json"];
  it.each(files)("%s never shows a password on the hash-password command line", (f) => {
    const text = fs.readFileSync(path.join(ROOT, f), "utf8");
    expect(text).not.toMatch(/hash-password\s+--\s+['"]/);
  });
});
