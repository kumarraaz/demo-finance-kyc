import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(p) ? [p] : [];
  });
const journeyFiles = [
  ...walk(path.join(ROOT, "src/app/apply")),
  ...walk(path.join(ROOT, "src/components/journey")),
  ...walk(path.join(ROOT, "src/lib/journey")),
];
const code = journeyFiles.filter((f) => !f.endsWith(".css"));
const rel = (f: string) => path.relative(ROOT, f);
const read = (f: string) => fs.readFileSync(f, "utf8");

describe("customer journey: nothing leaves the browser", () => {
  it("makes no network calls of any kind", () => {
    for (const f of code) {
      expect(read(f), rel(f)).not.toMatch(/\bfetch\s*\(|sendBeacon|XMLHttpRequest|WebSocket|EventSource|navigator\.share/);
    }
  });
  it("only the draft repository touches browser storage, and the session flag touches sessionStorage", () => {
    for (const f of code) {
      const text = read(f);
      if (rel(f) === "src/lib/journey/providers/local-repository.ts") continue;
      expect(text, rel(f)).not.toMatch(/localStorage/);
      if (rel(f) !== "src/lib/journey/liveness-session.ts") expect(text, rel(f)).not.toMatch(/sessionStorage/);
    }
  });
  it("only the camera module calls getUserMedia, and no code uploads or serialises an image", () => {
    for (const f of code) {
      const text = read(f);
      if (rel(f) !== "src/lib/journey/camera.ts") expect(text, rel(f)).not.toMatch(/getUserMedia\s*\(/);
      expect(text, rel(f)).not.toMatch(/toDataURL|FileReader|readAsDataURL|new FormData\([^)]*blob/i);
    }
  });
  it("the capture screen asks for the camera only from a button press or the one-time Start flag", () => {
    const capture = read(path.join(ROOT, "src/app/apply/liveness/capture/page.tsx"));
    expect(capture).toContain("consumeStart()");
    expect(capture).toMatch(/onClick: startCamera/);
    expect(capture).toContain("stopStream(streamRef.current)");
  });
  it("never stores or logs an OTP or a PAN", () => {
    for (const f of code) {
      const text = read(f);
      expect(text, rel(f)).not.toMatch(/console\.(log|info|debug)/);
    }
    const kyc = read(path.join(ROOT, "src/app/apply/kyc/page.tsx"));
    expect(kyc).toMatch(/setOtp\(""\);\s*\/\/ the code is never kept/);
  });
});

describe("customer journey: honest wording", () => {
  it("never states a verification, approval, sanction or disbursement as a fact", () => {
    for (const f of code) {
      const text = read(f);
      expect(text, rel(f)).not.toMatch(/(?<!\b(?:no|not|never) )\b(loan|application) (?:is |was |has been )?(approved|sanctioned)\b/i);
      expect(text, rel(f)).not.toMatch(/\bfunds (will be|have been) disbursed/i);
      expect(text, rel(f)).not.toMatch(/\b(KYC|PAN|Aadhaar|identity|liveness) (is |was |has been )?verified (successfully|by)\b/i);
      expect(text, rel(f)).not.toMatch(/Loan Approved|Congratulations/i);
    }
  });
  it("every use of approved/sanctioned/disbursed is a denial", () => {
    for (const f of code) {
      const text = read(f);
      for (const m of text.matchAll(/\b(approved|sanctioned|disbursed|approval|sanction)\b/gi)) {
        const before = text.slice(Math.max(0, m.index! - 70), m.index!);
        expect(before, `${rel(f)}: "${m[0]}"`).toMatch(/\b(no|not|never|nothing|neither|without|nor)\b|isn't|doesn't|does not|cannot|can't|\|/i);
      }
    }
  });
  it("labels every simulated figure: each screen with money or results carries a DEMO marker", () => {
    for (const page of ["offer", "asset-scheme", "add-ons", "calculation", "complete", "liveness/result", "kyc", "basic-details"]) {
      const text = read(path.join(ROOT, "src/app/apply", page, "page.tsx"));
      expect(text, page).toMatch(/DemoNotice|cj-demo-tag|DEMO/);
    }
  });
  it("never collects an Aadhaar number or an identity document", () => {
    for (const f of code) {
      expect(read(f), rel(f)).not.toMatch(/name="aadhaar|aadhaarNumber|type="file"|accept="image/i);
    }
  });
});
