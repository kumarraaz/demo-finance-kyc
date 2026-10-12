import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const trackedFiles = () =>
  spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .stdout.split("\0")
    .filter(Boolean);
const isIgnored = (p: string) => spawnSync("git", ["check-ignore", "-q", "--no-index", p], { cwd: root }).status === 0;

describe(".gitignore", () => {
  const lines = read(".gitignore").split("\n");

  it("has no empty comment sections and no runs of blank lines (the old 'Local database files' header was empty)", () => {
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith("#")) continue;
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      expect(j < lines.length && !lines[j].startsWith("#"), `comment "${lines[i]}" must be followed by a pattern`).toBe(true);
    }
    expect(/\n\n\n/.test(read(".gitignore"))).toBe(false);
  });

  it("still ignores everything that must never be committed", () => {
    for (const p of [".env", ".env.local", ".env.production", ".env.preview.local", ".vercel/project.json", "node_modules/x/index.js", ".next/BUILD_ID", "src/generated/prisma/client.ts", "vitest-results.json"]) {
      expect(isIgnored(p), `${p} must be ignored`).toBe(true);
    }
  });

  it("keeps the example env file committable", () => {
    expect(isIgnored(".env.example")).toBe(false);
  });

  it("no environment file other than .env.example is tracked", () => {
    expect(trackedFiles().filter((f) => /(^|\/)\.env/.test(f))).toEqual([".env.example"]);
  });
});

describe("tracked files contain no real infrastructure identifiers or assistant-specific wording", () => {
  const textFiles = () => trackedFiles().filter((f) => f !== "package-lock.json" && !/\.(png|jpe?g|gif|ico|woff2?|svg)$/i.test(f));

  it("has no real-looking Neon endpoint ids (ep-<word>-<word>-<8 chars>); tests use fixtures", () => {
    const re = /ep-[a-z]+-[a-z]+-[a-z0-9]{8}/;
    const hits = textFiles().filter((f) => f !== "tests/repo-hygiene.test.ts" && re.test(read(f)));
    expect(hits).toEqual([]);
  });

  it("the fixtures themselves are not shaped like real ids, so the check above would catch a real one", () => {
    expect(/ep-[a-z]+-[a-z]+-[a-z0-9]{8}/.test("ep-preview-fixture-000001")).toBe(false);
    expect(/ep-[a-z]+-[a-z]+-[a-z0-9]{8}/.test("ep-quiet-river-a1b2c3d4")).toBe(true);
  });

  it("user-facing scripts and docs do not address an assistant", () => {
    const files = textFiles().filter((f) => /^(scripts\/|docs\/|README\.md$|\.env\.example$)/.test(f));
    const offenders = files.filter((f) => /\b(Tell|Ask) Claude\b|\bClaude can\b/i.test(read(f)));
    expect(offenders).toEqual([]);
  });
});
