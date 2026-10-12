import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");

// The setup docs must keep telling the same story as the code (scripts/lib/direct-url.mjs).
describe("setup docs describe the direct-URL fallback", () => {
  it.each(["README.md", "docs/DEPLOYMENT.md", ".env.example"])("%s mentions DATABASE_URL_UNPOOLED", (f) => {
    expect(read(f)).toContain("DATABASE_URL_UNPOOLED");
  });
  it("states that DIRECT_URL has priority", () => {
    expect(read("README.md")).toMatch(/`DIRECT_URL` always wins/);
    expect(read("docs/DEPLOYMENT.md")).toMatch(/`DIRECT_URL` wins if both/);
    expect(read(".env.example")).toMatch(/DIRECT_URL always wins/);
  });
  it("warns that Preview must not point at the Production database", () => {
    expect(read("docs/DEPLOYMENT.md")).toMatch(/never let Preview use the Production database/i);
    expect(read("README.md")).toMatch(/Production\*? Neon resource/);
  });
  it("does not contain any connection string with credentials", () => {
    for (const f of ["README.md", "docs/DEPLOYMENT.md", ".env.example"]) {
      const bad = read(f).match(/postgres(ql)?:\/\/[^\s:"'<>]+:[^\s@"'<>]{3,}@(?!HOST|host)[^\s"'<>]+/g) ?? [];
      const real = bad.filter((m) => !/USER:PASSWORD|u:p@|choose-a-local-password|<|YOUR|dfk_app/i.test(m));
      expect(real, `${f} contains a credential-looking URL`).toEqual([]);
    }
  });
});
