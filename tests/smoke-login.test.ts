import { spawn } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { describeLoginFailure } from "../scripts/smoke-deployment.mjs";
import { readSecretTwice } from "../scripts/lib/prompt.mjs";

// Why: on the first real Preview run the real-credentials login returned a bare 401. The application and
// credential path were verified end to end (hidden prompts with edits and awkward characters included), so the
// remaining failure mode is a mistyped value: hidden input hides typos, and each wrong attempt spends one of the
// 5 allowed attempts. The script now confirms the password BEFORE sending and explains a 401 precisely.

describe("readSecretTwice", () => {
  const reader = (answers: string[]) => {
    const asked: string[] = [];
    return { asked, read: async (p: string) => (asked.push(p), answers.shift() ?? "") };
  };

  it("returns the value when both entries match, asking both prompts in order", async () => {
    const { asked, read } = reader(["correct horse 1!", "correct horse 1!"]);
    await expect(readSecretTwice("first?", "again?", read)).resolves.toBe("correct horse 1!");
    expect(asked).toEqual(["first?", "again?"]);
  });

  it("refuses a mismatch and never puts either entry in the error", async () => {
    const { read } = reader(["secret-entry-AAAA", "secret-entry-AAAB"]);
    const err = await readSecretTwice("a", "b", read).then(
      () => null,
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toMatch(/differ, so nothing was sent/);
    expect(err?.message).not.toContain("secret-entry");
  });

  it("is whitespace-exact (no trimming), like the hashing and login paths", async () => {
    const { read } = reader(["pw ", "pw"]);
    await expect(readSecretTwice("a", "b", read)).rejects.toThrow(/differ/);
  });
});

describe("describeLoginFailure", () => {
  it("explains 401, 429 and 503 and never claims which value was wrong", () => {
    expect(describeLoginFailure(401)).toMatch(/does not match the values configured/);
    expect(describeLoginFailure(401)).toMatch(/does not say which/);
    expect(describeLoginFailure(401)).toMatch(/5 attempts per IP per 15 minutes/);
    expect(describeLoginFailure(429)).toMatch(/rate limited/);
    expect(describeLoginFailure(503)).toMatch(/not_configured/);
    expect(describeLoginFailure(500)).toBe("HTTP 500");
  });
});

const servers: http.Server[] = [];
afterAll(() => servers.forEach((s) => s.close()));

describe("smoke-deployment explains a rejected login", () => {
  it("prints the hint (and never the password) when the real login gets 401 invalid_credentials", async () => {
    const url = await new Promise<string>((resolve) => {
      const s = http.createServer((req, res) => {
        res.setHeader("content-type", "application/json");
        if (req.url === "/api/health") return res.end(JSON.stringify({ status: "ok", database: "up", schema: "ok", mode: "demo", verification: "simulated" }));
        if (req.method === "POST" && req.url === "/api/admin/login") {
          res.statusCode = 401;
          return res.end(JSON.stringify({ error: { code: "invalid_credentials", message: "Invalid username or password" } }));
        }
        res.statusCode = 404;
        res.end("{}");
      }).listen(0, "127.0.0.1", () => {
        servers.push(s);
        resolve(`http://127.0.0.1:${(s.address() as AddressInfo).port}`);
      });
    });
    const password = "test-only-password-for-hint-1";
    const out = await new Promise<string>((resolve) => {
      const child = spawn(process.execPath, ["scripts/smoke-deployment.mjs", url], {
        env: { PATH: process.env.PATH ?? "", SMOKE_ADMIN_USERNAME: "kumarraaz", SMOKE_ADMIN_PASSWORD: password } as unknown as NodeJS.ProcessEnv,
      });
      let text = "";
      child.stdout.on("data", (d) => (text += d));
      child.stderr.on("data", (d) => (text += d));
      child.on("close", () => resolve(text));
    });
    expect(out).toMatch(/FAIL {2}login with the real credentials succeeds - 401 invalid_credentials: the username or password typed here does not match/);
    expect(out).not.toContain(password);
  });
});
