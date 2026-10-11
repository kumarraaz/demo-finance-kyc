import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard: every admin page and admin API route must perform its own
// session check, because the proxy check is optimistic (signature only).
function walk(dir: string, match: RegExp, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, match, out);
    else if (match.test(entry.name)) out.push(full);
  }
  return out;
}
const SRC = path.resolve(__dirname, "../src/app");
const rel = (f: string) => path.relative(SRC, f);

describe("authentication is enforced in every admin entry point", () => {
  const pages = walk(path.join(SRC, "admin"), /^page\.tsx$/).filter((f) => !f.includes(`${path.sep}login${path.sep}`));
  const routes = walk(path.join(SRC, "api/admin"), /^route\.ts$/).filter(
    (f) => !/[\\/](login|logout)[\\/]route\.ts$/.test(f),
  );

  it("finds the expected entry points (guards against a silent glob failure)", () => {
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(routes.length).toBeGreaterThanOrEqual(3);
  });
  it.each(pages.map((f) => [rel(f), f]))("page %s calls requireAdminPage()", (_name, file) => {
    expect(fs.readFileSync(file, "utf8")).toContain("await requireAdminPage()");
  });
  it.each(routes.map((f) => [rel(f), f]))("route %s calls getAdminSession() for every handler", (_name, file) => {
    const src = fs.readFileSync(file, "utf8");
    const handlers = src.match(/export (async )?function (GET|POST|PUT|PATCH|DELETE)\b/g) ?? [];
    const checks = src.match(/await getAdminSession\(request\)/g) ?? [];
    expect(handlers.length).toBeGreaterThan(0);
    expect(checks.length).toBe(handlers.length);
  });
  it.each(routes.filter((f) => /export (async )?function (POST|PUT|PATCH|DELETE)\b/.test(fs.readFileSync(f, "utf8"))).map((f) => [rel(f), f]))(
    "state-changing route %s uses guardWrite() (origin + content-type)",
    (_name, file) => {
      expect(fs.readFileSync(file, "utf8")).toContain("guardWrite(request)");
    },
  );
  it("login and logout also use guardWrite()", () => {
    for (const r of ["login", "logout"]) {
      expect(fs.readFileSync(path.join(SRC, `api/admin/${r}/route.ts`), "utf8")).toContain("guardWrite(request)");
    }
  });
});

describe("browser code talks to the API the way the server requires", () => {
  const components = walk(path.resolve(__dirname, "../src/components"), /\.tsx$/).filter((f) =>
    fs.readFileSync(f, "utf8").includes("fetch("),
  );
  it("finds the client components that call the API", () => {
    expect(components.length).toBeGreaterThanOrEqual(4);
  });
  // Regression: logout once sent a bare POST, was rejected with 415, and the UI ignored it,
  // leaving the session alive.
  it.each(components.map((f) => [path.basename(f), f]))("%s sends Content-Type: application/json on every POST", (_n, file) => {
    const src = fs.readFileSync(file, "utf8");
    const posts = src.match(/method:\s*"POST"/g) ?? [];
    const jsonHeaders = src.match(/"Content-Type":\s*"application\/json"/g) ?? [];
    expect(posts.length).toBeGreaterThan(0);
    expect(jsonHeaders.length).toBe(posts.length);
  });
  it("logout only navigates away after the server confirms (res.ok)", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../src/components/AdminNav.tsx"), "utf8");
    expect(src).toMatch(/if \(!res\.ok\)/);
  });
});
