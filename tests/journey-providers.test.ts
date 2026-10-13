import { describe, expect, it } from "vitest";
import { createEmptyDraft, parseDraft, scrubDraft } from "@/lib/journey/draft";
import { maskEmail, maskMobile, maskName, maskPan } from "@/lib/journey/mask";
import { createDemoKycProvider } from "@/lib/journey/providers/demo-kyc";
import { createDemoLivenessProvider } from "@/lib/journey/providers/demo-liveness";
import { createDemoOfferProvider } from "@/lib/journey/providers/demo-offer";
import { createLocalRepository, MAX_DRAFTS, type StorageLike } from "@/lib/journey/providers/local-repository";
import { createDemoProviders, integrationReadiness } from "@/lib/journey/providers";
import { generateReference, REFERENCE_PATTERN } from "@/lib/journey/reference";
import { DEFAULT_RULES } from "@/lib/journey/rules";
import { completeDraft, TODAY } from "./helpers/journey-fixtures";

class Mem implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe("reference ids", () => {
  it("are well-formed, random and never derived from personal data", () => {
    const refs = new Set(Array.from({ length: 500 }, () => generateReference()));
    expect(refs.size).toBe(500);
    for (const r of refs) expect(r).toMatch(REFERENCE_PATTERN);
  });
  it("retries on a collision and fails loudly if it cannot find a free one", () => {
    let calls = 0;
    const seq = () => { calls += 1; return new Uint8Array(10).fill(calls); };
    const ref = generateReference(seq, (r) => calls < 3 && r.length > 0);
    expect(calls).toBe(3);
    expect(ref).toMatch(REFERENCE_PATTERN);
    expect(() => generateReference(seq, () => true)).toThrow();
  });
});

describe("masking", () => {
  it("masks PAN, mobile, names and email", () => {
    expect(maskPan("ABCPE1234F")).toBe("AB******4F");
    expect(maskPan("abcpe1234f")).toBe("AB******4F");
    expect(maskPan("short")).toBe("*****");
    expect(maskMobile("9000000001")).toBe("******0001");
    expect(maskName("Asha", "Verma")).toBe("Asha V.");
    expect(maskName("", "")).toBe("-");
    expect(maskEmail("asha@example.com")).toBe("a***@example.com");
    expect(maskEmail("bad")).toBe("");
  });
});

describe("draft parsing and scrubbing", () => {
  it("round-trips a draft and ignores unknown or wrongly-typed values", async () => {
    const d = await completeDraft();
    const back = parseDraft(JSON.parse(JSON.stringify(d)), TODAY)!;
    expect(back).toEqual(d);
    const hostile = { ...JSON.parse(JSON.stringify(d)), evil: "x", basic: { ...d.basic, mobile: 12345, extra: "y" }, personal: "nope", visited: { basic: true, hack: true } };
    const p = parseDraft(hostile, TODAY)!;
    expect(p.basic.mobile).toBe(""); // wrong type -> default
    expect(p.personal.firstName).toBe("");
    expect(Object.keys(p.visited)).toEqual(["basic"]);
    expect("evil" in p).toBe(false);
    expect("extra" in p.basic).toBe(false);
  });
  it("rejects anything that is not a version-1 draft", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft({ schemaVersion: 2, reference: "x" })).toBeNull();
    expect(parseDraft({ schemaVersion: 1 })).toBeNull();
    expect(parseDraft([])).toBeNull();
  });
  it("blanks PAN-like and Aadhaar-like strings before storage, keeping the masked PAN", async () => {
    const d = await completeDraft((x) => {
      x.personal.employerName = "ABCPE1234F";
      x.address.line2 = "1234 5678 9012";
      x.basic.panMasked = "AB******4F";
    });
    const { draft, removed } = scrubDraft(d);
    expect(removed).toBe(2);
    expect(draft.personal.employerName).toBe("");
    expect(draft.address.line2).toBe("");
    expect(draft.basic.panMasked).toBe("AB******4F");
    expect(draft.reference).toBe(d.reference);
  });
});

describe("local draft repository", () => {
  it("saves, loads, lists and tracks the current draft", async () => {
    const repo = createLocalRepository(new Mem(), DEFAULT_RULES, () => TODAY);
    const d = await completeDraft();
    await repo.saveDraft(d);
    expect((await repo.loadApplication(d.reference))!.personal.firstName).toBe("Asha");
    expect(await repo.getCurrentReference()).toBeNull();
    await repo.setCurrentReference(d.reference);
    expect(await repo.getCurrentReference()).toBe(d.reference);
    expect((await repo.listDrafts()).map((x) => x.reference)).toEqual([d.reference]);
    expect(await repo.getApplicationStatus(d.reference)).toMatchObject({ reference: d.reference });
    expect(await repo.loadApplication("DFK-NOPE0-NOPE0")).toBeNull();
  });
  it("never writes a raw PAN, OTP or identity number to storage", async () => {
    const mem = new Mem();
    const repo = createLocalRepository(mem, DEFAULT_RULES, () => TODAY);
    const d = await completeDraft((x) => { x.personal.businessName = "ABCPE1234F"; });
    await repo.saveDraft(d);
    const all = [...mem.m.values()].join("\n");
    expect(all).not.toMatch(/[A-Z]{5}\d{4}[A-Z]/);
    expect(all).not.toMatch(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/);
    expect(all).not.toMatch(/otp|123456|password|token|secret/i);
  });
  it("expires old drafts and survives corrupt storage", async () => {
    const mem = new Mem();
    const d = await completeDraft();
    await createLocalRepository(mem, DEFAULT_RULES, () => TODAY).saveDraft(d);
    const later = new Date(TODAY.getTime() + 8 * 86_400_000);
    const repo = createLocalRepository(mem, DEFAULT_RULES, () => later);
    expect(await repo.loadApplication(d.reference)).toBeNull();
    expect(await repo.listDrafts()).toEqual([]);
    mem.setItem("dfk.journey.v1.index", "{not json");
    mem.setItem("dfk.journey.v1.draft.DFK-BAD00-BAD00", "{not json");
    expect(await repo.listDrafts()).toEqual([]);
    expect(await repo.loadApplication("DFK-BAD00-BAD00")).toBeNull();
  });
  it("keeps at most MAX_DRAFTS and deletes cleanly", async () => {
    const mem = new Mem();
    const repo = createLocalRepository(mem, DEFAULT_RULES, () => TODAY);
    for (let i = 0; i < MAX_DRAFTS + 3; i++) await repo.saveDraft(createEmptyDraft(`DFK-${String(i).padStart(5, "0")}-AAAAA`, TODAY));
    expect((await repo.listDrafts()).length).toBe(MAX_DRAFTS);
    const first = (await repo.listDrafts())[0].reference;
    await repo.setCurrentReference(first);
    await repo.deleteDraft(first);
    expect(await repo.getCurrentReference()).toBeNull();
    await repo.clearAll();
    expect([...mem.m.keys()]).toEqual([]); // nothing left behind
    expect(await repo.listDrafts()).toEqual([]);
  });
  it("falls back to memory when browser storage is unavailable", async () => {
    const repo = createLocalRepository(null, DEFAULT_RULES, () => TODAY);
    expect(repo.persistent).toBe(false);
    await repo.saveDraft(createEmptyDraft("DFK-AAAAA-BBBBB", TODAY));
    expect(await repo.loadApplication("DFK-AAAAA-BBBBB")).not.toBeNull();
  });
});

describe("demo KYC provider", () => {
  it("issues a demo code, verifies the documented demo value and counts attempts", async () => {
    const p = createDemoKycProvider(DEFAULT_RULES, () => TODAY);
    expect(p.meta.mode).toBe("demo");
    const r = await p.requestVerification({ reference: "R1", consent: true });
    expect(r.status).toBe("demo_otp_issued");
    expect(new Date(r.resendAvailableAt).getTime() - new Date(r.requestedAt).getTime()).toBe(30_000);
    expect(await p.getVerificationStatus("R1")).toEqual({ status: "demo_otp_issued" });
    expect(await p.verifyOtp({ reference: "R1", otp: "000000" })).toMatchObject({ status: "demo_otp_issued", attemptsLeft: 2 });
    const ok = await p.verifyOtp({ reference: "R1", otp: "123456" });
    expect(ok.status).toBe("demo_verified");
    expect(ok.documentSummary).toContain("Placeholder");
    expect(await p.getVerificationStatus("R1")).toEqual({ status: "not_started" });
  });
  it("fails after the attempt limit and refuses a verify without a request", async () => {
    const p = createDemoKycProvider(DEFAULT_RULES, () => TODAY);
    expect((await p.verifyOtp({ reference: "R2", otp: "123456" })).status).toBe("failed");
    await p.requestVerification({ reference: "R2", consent: true });
    await p.verifyOtp({ reference: "R2", otp: "1" });
    await p.verifyOtp({ reference: "R2", otp: "2" });
    expect(await p.verifyOtp({ reference: "R2", otp: "3" })).toMatchObject({ status: "failed", attemptsLeft: 0 });
    expect((await p.verifyOtp({ reference: "R2", otp: "123456" })).status).toBe("failed"); // must request a new code
  });
  it("can resume a request that was open before a page reload, but only with attempts left", async () => {
    const p = createDemoKycProvider(DEFAULT_RULES, () => TODAY);
    expect(await p.verifyOtp({ reference: "R3", otp: "000000", resumeAttemptsLeft: 2 })).toMatchObject({ status: "demo_otp_issued", attemptsLeft: 1 });
    expect((await p.verifyOtp({ reference: "R3", otp: "123456", resumeAttemptsLeft: 1 })).status).toBe("demo_verified");
    expect((await p.verifyOtp({ reference: "R4", otp: "123456", resumeAttemptsLeft: 0 })).status).toBe("failed");
  });
});

describe("demo liveness provider", () => {
  it("returns the fixture outcome with a constant demo score and never takes image data", async () => {
    for (const [fx, outcome] of [["pass", "demo_passed"], ["review", "demo_review"], ["fail", "demo_failed"]] as const) {
      const p = createDemoLivenessProvider({ ...DEFAULT_RULES, livenessFixture: fx }, () => TODAY);
      const s = await p.startSession("R1");
      await p.submitCapture({ sessionId: s.sessionId, source: "placeholder" });
      expect(await p.getResult(s.sessionId)).toEqual({ outcome, demoScorePct: 92, completedAt: TODAY.toISOString() });
      expect(p.submitCapture.length).toBe(1); // one argument: {sessionId, source}; no image parameter exists
    }
    const p = createDemoLivenessProvider(DEFAULT_RULES, () => TODAY);
    await expect(p.getResult("unknown")).rejects.toThrow();
    await expect(p.submitCapture({ sessionId: "unknown", source: "camera" })).rejects.toThrow();
  });
});

describe("demo offer provider", () => {
  const offer = (req: number, inc: number, rules = DEFAULT_RULES) => createDemoOfferProvider(rules).getIndicativeOffer({ requestedAmountRupees: req, monthlyIncomeRupees: inc });
  it("labels its source and returns eligible, review or not eligible from the fixture rules", async () => {
    const ok = await offer(50_000, 40_000);
    expect(ok).toMatchObject({ status: "eligible", eligibleAmountRupees: 50_000, source: "Demo fixture (not a lender offer)", tenureMonths: 12 });
    const review = await offer(500_000, 20_000);
    expect(review).toMatchObject({ status: "review_required", eligibleAmountRupees: 200_000 });
    const no = await offer(50_000, 500);
    expect(no).toMatchObject({ status: "not_eligible", eligibleAmountRupees: 0, emiPaise: 0 });
  });
  it("reports 'integration required' instead of inventing an offer when no fixture is enabled", async () => {
    const r = await offer(50_000, 40_000, { ...DEFAULT_RULES, offer: { ...DEFAULT_RULES.offer, enabled: false } });
    expect(r.status).toBe("integration_required");
    expect("emiPaise" in r).toBe(false);
  });
});

describe("provider registry", () => {
  it("wires demo adapters only and reports nothing as a live integration", () => {
    const rows = integrationReadiness(createDemoProviders());
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(rows.every((r) => r.meta.mode === "demo" && r.ready === false)).toBe(true);
  });
});
