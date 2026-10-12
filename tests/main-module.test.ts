import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isMainModule } from "../scripts/lib/main-module.mjs";

// Regression: `import.meta.url === \`file://${process.argv[1]}\`` is false whenever the checkout
// path has a space, '#', '%' or non-ASCII character, so the scripts exited 0 and did nothing.
// A CI gate that silently does nothing is worse than no gate, so these run the REAL scripts
// from awkward directories and require them to actually execute.

const repoScripts = path.resolve(__dirname, "..", "scripts");
const AWKWARD = ["with space", "hash#mark", "per%cent", "ünï cödé", "a b#c%d ü"];
let root: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "kyc-main-module-"));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

function copyScripts(dirName: string): string {
  const dir = path.join(root, dirName);
  mkdirSync(dir, { recursive: true });
  cpSync(repoScripts, path.join(dir, "scripts"), { recursive: true });
  return path.join(dir, "scripts");
}

function run(script: string, args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv,
    timeout: 20_000,
  });
}

describe("isMainModule", () => {
  it("matches the script node was started with, including awkward paths", () => {
    for (const name of AWKWARD) {
      const file = path.join(root, name, "x.mjs");
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, "");
      expect(isMainModule(pathToFileURL(file).href, file), name).toBe(true);
    }
  });

  it("is false for a different module, or when argv[1] is missing", () => {
    expect(isMainModule("file:///somewhere/else.mjs", path.join(root, "nope.mjs"))).toBe(false);
    expect(isMainModule("file:///somewhere/else.mjs", undefined)).toBe(false);
    expect(isMainModule("file:///somewhere/else.mjs", "")).toBe(false);
  });

  it("follows a symlinked script path", () => {
    const real = path.join(root, "real.mjs");
    const link = path.join(root, "link.mjs");
    writeFileSync(real, "");
    symlinkSync(real, link);
    expect(isMainModule(pathToFileURL(real).href, link)).toBe(true);
  });

  it("the old naive comparison really is wrong for these paths (why the helper exists)", () => {
    const file = path.join(root, "with space", "x.mjs");
    expect(pathToFileURL(file).href).not.toBe(`file://${file}`);
  });
});

describe.each(AWKWARD)("the CLI scripts still execute when run from %j", (dirName) => {
  it("assert-no-skips runs (usage error, not a silent exit 0), and enforces its gate", () => {
    const dir = copyScripts(dirName);
    const noArgs = run(path.join(dir, "assert-no-skips.mjs"), []);
    expect(noArgs.status).toBe(2);
    expect(noArgs.stderr).toMatch(/usage/);

    const bad = path.join(root, `${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(bad, JSON.stringify({ numTotalTests: 5, numPendingTests: 2 }));
    const skipped = run(path.join(dir, "assert-no-skips.mjs"), [bad]);
    expect(skipped.status).toBe(1);
    expect(skipped.stderr).toMatch(/skipped/);

    const good = path.join(root, `${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(good, JSON.stringify({ numTotalTests: 5, numPendingTests: 0, numTodoTests: 0, numFailedTests: 0 }));
    const ok = run(path.join(dir, "assert-no-skips.mjs"), [good]);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/gate passed/);
  });

  it("check-env runs and reports", () => {
    const dir = copyScripts(dirName);
    const r = run(path.join(dir, "check-env.mjs"), ["preview"]);
    expect(r.stdout).toMatch(/Environment check \(preview\)/);
    expect(r.status).toBe(1); // nothing is configured, so it must say NOT ready
    expect(r.stdout).toMatch(/NOT ready/);
  });

  it("smoke-deployment runs (usage error, not a silent exit 0)", () => {
    const dir = copyScripts(dirName);
    const r = run(path.join(dir, "smoke-deployment.mjs"), []);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/usage/);
  });

  it("audit-gate runs (fails closed when npm audit is unavailable, instead of passing silently)", () => {
    const dir = copyScripts(dirName);
    // No PATH, so `npm` cannot be found: the gate must report a failure, never exit 0 quietly.
    const r = spawnSync(process.execPath, [path.join(dir, "audit-gate.mjs")], {
      encoding: "utf8",
      env: { PATH: "" } as unknown as NodeJS.ProcessEnv,
      timeout: 20_000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Audit gate FAILED/);
  });
});
