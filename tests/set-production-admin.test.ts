import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.resolve(__dirname, "..", "scripts", "set-production-admin.sh");
const text = fs.readFileSync(script, "utf8");
const run = (args: string[], env: Record<string, string> = {}) =>
  spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"], // no TTY on stdin
    env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv,
  });

// The interactive path (typed confirmation, hidden password, real Vercel CLI request shape, refusal when a
// variable already exists) was exercised in a pseudo-terminal against a mock Vercel API with a fake password.
// These tests pin the safety properties that must not regress.
describe("scripts/set-production-admin.sh", () => {
  it("is valid bash", () => {
    expect(spawnSync("bash", ["-n", script]).status).toBe(0);
  });

  it("never puts a secret in a command line, and never overwrites", () => {
    expect(text).not.toMatch(/--value\b/);
    expect(text).not.toMatch(/--force\b/);
    expect(text).not.toMatch(/\bechoh?\b[^\n]*\$\{?(secret|hash)\b/);
    expect(text).toMatch(/printf '%s' "\$2" \| "\$vercel_bin" env add/);
  });

  it("only ever targets the production environment, with no git branch, for exactly three names", () => {
    expect(text).toMatch(/env add "\$1" production "\$3"/);
    expect(text).not.toMatch(/\bpreview\b[^\n]*env add|env add[^\n]*\bpreview\b/);
    expect(text).not.toMatch(/\bdevelopment\b/);
    expect(text).toMatch(/names=\(SESSION_SECRET ADMIN_PASSWORD_HASH ADMIN_USERNAME\)/);
  });

  it("marks both secrets sensitive", () => {
    expect(text).toMatch(/add SESSION_SECRET "\$secret" --sensitive/);
    expect(text).toMatch(/add ADMIN_PASSWORD_HASH "\$hash" --sensitive/);
  });

  it("requires typed confirmation and checks for existing variables BEFORE adding anything", () => {
    const confirm = text.indexOf('[ "$answer" = "production" ]');
    const exists = text.indexOf('die "$name already exists for Production');
    const firstAdd = text.indexOf('add SESSION_SECRET "$secret"');
    expect(confirm).toBeGreaterThan(-1);
    expect(exists).toBeGreaterThan(confirm);
    expect(firstAdd).toBeGreaterThan(exists);
  });

  it("validates the hash format before sending anything", () => {
    expect(text).toContain("^scrypt\\$[0-9a-f]{32}\\$[0-9a-f]{128}$");
    expect(text.indexOf("unexpected hash format")).toBeLessThan(text.indexOf('add SESSION_SECRET "$secret"'));
  });

  it("never prints the variable listing, and does not address an assistant", () => {
    expect(text).not.toMatch(/\bClaude\b/i);
    expect(text).not.toMatch(/echo[^\n]*\$listing|printf[^\n]*\$listing/);
  });

  it("refuses without an interactive terminal and for a malformed username", () => {
    const notTty = run([], { VERCEL_BIN: "true" });
    expect(notTty.status).toBe(1);
    expect(notTty.stderr).toMatch(/interactive terminal/);
    const badName = run(["bad name;rm"], { VERCEL_BIN: "true" });
    expect(badName.status).toBe(1);
    expect(badName.stderr).toMatch(/username/);
  });
});
