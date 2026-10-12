import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.resolve(__dirname, "..", "scripts", "set-preview-admin.sh");
const text = fs.readFileSync(script, "utf8");
const run = (args: string[], env: Record<string, string> = {}) =>
  spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"], // no TTY on stdin
    env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv,
  });

// The interactive path (hidden password prompt, real Vercel CLI request shape) was exercised by hand
// against a mock API in a pseudo-terminal; these tests pin the safety properties that must not regress.
describe("scripts/set-preview-admin.sh", () => {
  it("is valid bash", () => {
    expect(spawnSync("bash", ["-n", script]).status).toBe(0);
  });

  it("never puts a secret in a command line, and never overwrites", () => {
    expect(text).not.toMatch(/--value\b/);
    expect(text).not.toMatch(/--force\b/);
    expect(text).not.toMatch(/\bechoh?\b[^\n]*\$\{?(secret|hash)\b/); // never echoes the secret or the hash
    expect(text).toMatch(/printf '%s' "\$2" \| "\$vercel_bin" env add/); // values go through stdin only
  });

  it("marks the secrets sensitive and only ever targets Preview on a named branch", () => {
    expect(text).toMatch(/add SESSION_SECRET "\$secret" --sensitive/);
    expect(text).toMatch(/add ADMIN_PASSWORD_HASH "\$hash" --sensitive/);
    expect(text).toMatch(/env add "\$1" preview "\$branch"/);
    expect(text).not.toMatch(/\b(production|development)\b[^\n]*env add|env add[^\n]*\b(production|development)\b/);
  });

  it("validates the hash format before sending anything", () => {
    expect(text).toContain("^scrypt\\$[0-9a-f]{32}\\$[0-9a-f]{128}$");
    expect(text.indexOf("unexpected hash format")).toBeLessThan(text.indexOf("add SESSION_SECRET"));
  });

  it("refuses main, master and production", () => {
    for (const b of ["main", "master", "production"]) {
      const r = run([b], { VERCEL_BIN: "true" });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/refusing to target/);
    }
  });

  it("requires a branch argument and an interactive terminal", () => {
    const none = run([]);
    expect(none.status).toBe(2);
    expect(none.stderr).toMatch(/usage/);
    const notTty = run(["some-feature-branch"], { VERCEL_BIN: "true" });
    expect(notTty.status).toBe(1);
    expect(notTty.stderr).toMatch(/interactive terminal/);
  });

  it("rejects a malformed username", () => {
    const r = run(["some-feature-branch", "bad name;rm"], { VERCEL_BIN: "true" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/username/);
  });
});

describe("scripts/set-preview-admin.sh output is neutral and useful for any operator", () => {
  it("does not mention an assistant, and tells the operator how to confirm the variables exist", () => {
    expect(text).not.toMatch(/\bClaude\b/i);
    expect(text).toMatch(/env ls preview "?\$branch"?|env ls preview \$branch/);
    expect(text).toMatch(/values stay hidden/);
  });

  it("the suggested command is read-only (ls) and never prints a secret variable", () => {
    const done = text.slice(text.indexOf('echo "Done.'));
    expect(done).not.toMatch(/\$secret|\$hash|env pull|--decrypt/);
  });
});
