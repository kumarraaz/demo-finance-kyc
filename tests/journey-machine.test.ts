import { describe, expect, it } from "vitest";
import { addOnsSubtotalPaise } from "@/lib/journey/addons";
import { getAssetDetail, getManufacturers, getModels, getVariants, selectLevel } from "@/lib/journey/catalog";
import { createEmptyDraft } from "@/lib/journey/draft";
import { buildCalculation } from "@/lib/journey/final";
import { calculationInputKey, deriveJourney, isStepAvailable, markVisited, nextStep, offerInputKey, overallStatus, progressPercent } from "@/lib/journey/machine";
import { DEFAULT_RULES } from "@/lib/journey/rules";
import { evaluateScheme, getAvailableSchemes, getScheme } from "@/lib/journey/schemes";
import { STEP_IDS } from "@/lib/journey/types";
import { completeDraft, NOW_ISO, TODAY } from "./helpers/journey-fixtures";

describe("state machine: derived completion", () => {
  it("starts with everything pending and only the first step open", () => {
    const d = createEmptyDraft("DFK-AAAAA-BBBBB", TODAY);
    const j = deriveJourney(d, TODAY);
    expect(STEP_IDS.map((s) => j[s].status)).toEqual(Array(8).fill("pending"));
    expect(isStepAvailable("basic", j)).toBe(true);
    expect(STEP_IDS.slice(1).some((s) => isStepAvailable(s, j))).toBe(false);
    expect(nextStep(j)).toBe("basic");
    expect(overallStatus(j, d)).toBe("not_started");
    expect(progressPercent(j)).toBe(0);
  });

  it("marks every step completed for a fully valid fictional draft", async () => {
    const d = await completeDraft();
    const j = deriveJourney(d, TODAY);
    expect(STEP_IDS.map((s) => j[s].status)).toEqual(Array(8).fill("completed"));
    expect(nextStep(j)).toBe("done");
    expect(overallStatus(j, d)).toBe("completed");
    expect(progressPercent(j)).toBe(100);
  });

  it("does not complete a step just because its screen was opened", () => {
    let d = createEmptyDraft("DFK-AAAAA-BBBBB", TODAY);
    for (const id of STEP_IDS) d = markVisited(d, id, TODAY);
    const j = deriveJourney(d, TODAY);
    expect(STEP_IDS.map((s) => j[s].status)).toEqual(Array(8).fill("in_progress"));
    expect(nextStep(j)).toBe("basic");
  });

  it("requires explicit demo verification of mobile and PAN for Basic Details", async () => {
    const d = await completeDraft((x) => { x.basic.panStatus = "not_started"; });
    expect(deriveJourney(d, TODAY).basic.status).toBe("in_progress");
    const failed = await completeDraft((x) => { x.basic.panStatus = "failed"; });
    expect(deriveJourney(failed, TODAY).basic.status).toBe("failed");
  });

  it("derives completion from data, so breaking saved data un-completes the step", async () => {
    const d = await completeDraft((x) => { x.basic.mobile = "123"; });
    expect(deriveJourney(d, TODAY).basic.status).not.toBe("completed");
  });

  it("gates later steps until every earlier step has passed", async () => {
    const d = await completeDraft((x) => { x.kyc.status = "request_pending"; });
    const j = deriveJourney(d, TODAY);
    expect(j.kyc.status).toBe("in_progress");
    expect(isStepAvailable("kyc", j)).toBe(true);
    expect(isStepAvailable("demographics", j)).toBe(false);
    expect(isStepAvailable("calculation", j)).toBe(false);
    expect(nextStep(j)).toBe("kyc");
  });

  it("needs the KYC consent as well as the demo result", async () => {
    const d = await completeDraft((x) => { x.kyc.consent = false; });
    expect(deriveJourney(d, TODAY).kyc.status).not.toBe("completed");
  });

  it("marks review-required (not failed, not blocked) for a different address or suspected activity", async () => {
    const addr = await completeDraft((x) => { x.address.matchesDocument = "no"; });
    const ja = deriveJourney(addr, TODAY);
    expect(ja.demographics.status).toBe("review_required");
    expect(isStepAvailable("liveness", ja)).toBe(true);
    const sus = await completeDraft((x) => { x.asset.suspectedActivity = "yes"; });
    expect(deriveJourney(sus, TODAY).demographics.status).toBe("review_required");
    expect(overallStatus(deriveJourney(sus, TODAY), sus)).toBe("review_required");
  });

  it("maps the three demo liveness outcomes", async () => {
    const mk = (outcome: "demo_passed" | "demo_review" | "demo_failed") => completeDraft((x) => { x.liveness.result = { outcome, demoScorePct: 92, completedAt: NOW_ISO }; });
    expect(deriveJourney(await mk("demo_passed"), TODAY).liveness.status).toBe("completed");
    expect(deriveJourney(await mk("demo_review"), TODAY).liveness.status).toBe("review_required");
    expect(deriveJourney(await mk("demo_failed"), TODAY).liveness.status).toBe("failed");
    const noConsent = await completeDraft((x) => { x.liveness.consent = false; });
    expect(deriveJourney(noConsent, TODAY).liveness.status).not.toBe("completed");
  });

  it("treats a stored offer as stale when the answers it was based on change", async () => {
    const d = await completeDraft((x) => { x.personal.requestedAmount = 60_000; });
    expect(d.offer.inputKey).not.toBe(offerInputKey(d));
    const j = deriveJourney(d, TODAY);
    expect(j.offer.status).toBe("in_progress");
    expect(isStepAvailable("asset", j)).toBe(false);
  });

  it("needs an acknowledged, eligible offer; a not-eligible offer is failed", async () => {
    const unack = await completeDraft((x) => { x.offer.acknowledged = false; });
    expect(deriveJourney(unack, TODAY).offer.status).toBe("in_progress");
    const rev = await completeDraft((x) => { x.offer.offer!.status = "review_required"; x.offer.offer!.reasons = ["r"]; });
    expect(deriveJourney(rev, TODAY).offer.status).toBe("review_required");
    const bad = await completeDraft((x) => { x.offer.offer!.status = "not_eligible"; });
    expect(deriveJourney(bad, TODAY).offer.status).toBe("failed");
    const pending = await completeDraft((x) => { x.offer.offer = { ...x.offer.offer!, status: "integration_required" }; });
    expect(deriveJourney(pending, TODAY).offer.status).toBe("pending");
  });

  it("requires a chosen scheme (never auto-selected) and an explicit add-on confirmation", async () => {
    const noScheme = await completeDraft((x) => { x.schemeId = ""; });
    expect(deriveJourney(noScheme, TODAY).asset.status).toBe("in_progress");
    const unconfirmed = await completeDraft((x) => { x.addons.confirmed = false; });
    expect(deriveJourney(unconfirmed, TODAY).addons.status).toBe("in_progress"); // opened, not confirmed
    const unopened = await completeDraft((x) => { x.addons.confirmed = false; delete x.visited.addons; });
    expect(deriveJourney(unopened, TODAY).addons.status).toBe("pending");
    const picked = await completeDraft((x) => { x.addons = { selected: [{ id: "setup", optionId: "once" }], confirmed: false }; });
    expect(deriveJourney(picked, TODAY).addons.status).toBe("in_progress");
  });

  it("invalidates the final calculation when its inputs change", async () => {
    const changed = await completeDraft((x) => { x.schemeId = "std-6"; });
    expect(changed.calculation.result!.inputKey).not.toBe(calculationInputKey(changed));
    expect(deriveJourney(changed, TODAY).calculation.status).toBe("in_progress");
    const unconfirmed = await completeDraft((x) => { x.calculation.confirmedAt = undefined; });
    expect(deriveJourney(unconfirmed, TODAY).calculation.status).toBe("in_progress");
  });

  it("reports sub-step completion inside Demographic Details", async () => {
    const d = await completeDraft((x) => { x.address.pin = ""; });
    const j = deriveJourney(d, TODAY);
    expect(j.demographicSubsteps).toMatchObject({ personal: { complete: true }, address: { complete: false }, asset: { complete: true } });
    expect(j.demographics.status).toBe("in_progress");
  });

  it("reports failed overall when any step failed", async () => {
    const d = await completeDraft((x) => { x.kyc.status = "failed"; });
    expect(overallStatus(deriveJourney(d, TODAY), d)).toBe("failed");
  });
});

describe("final calculation assembly", () => {
  it("lists exactly what is missing and where to fix it", () => {
    const d = createEmptyDraft("DFK-AAAAA-BBBBB", TODAY);
    const r = buildCalculation(d, DEFAULT_RULES, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing.map((m) => m.step).sort()).toEqual(["addons", "asset", "asset", "offer"]);
  });
  it("includes selected add-ons in the financed amount and changes when they change", async () => {
    const base = await completeDraft();
    const withAddon = await completeDraft((x) => { x.addons = { selected: [{ id: "care-plan", optionId: "24m" }], confirmed: true }; });
    const a = buildCalculation(base, DEFAULT_RULES, TODAY);
    const b = buildCalculation(withAddon, DEFAULT_RULES, TODAY);
    if (!a.ok || !b.ok) throw new Error("expected results");
    expect(b.result.addOnsPaise).toBe(249_900);
    expect(b.result.financedAmountPaise - a.result.financedAmountPaise).toBe(249_900);
    expect(b.result.inputKey).not.toBe(a.result.inputKey);
  });
  it("uses the selected scheme's terms and the catalog price, not the requested amount", async () => {
    const d = await completeDraft();
    const r = buildCalculation(d, DEFAULT_RULES, TODAY);
    if (!r.ok) throw new Error("expected result");
    expect(r.result.assetPricePaise).toBe(getAssetDetail(d.asset)!.pricePaise);
    expect(r.result.tenureMonths).toBe(getScheme("std-12")!.tenureMonths);
    expect(r.result.downPaymentPaise).toBe(Math.round(r.result.assetPricePaise * 0.1));
  });
});

describe("demo catalog, schemes and add-ons", () => {
  it("lists dependent options level by level", () => {
    expect(getManufacturers("smartphone").map((m) => m.id)).toEqual(["aurora-mobile", "bluepeak"]);
    expect(getModels("smartphone", "bluepeak").map((m) => m.id)).toEqual(["bp-x2"]);
    expect(getModels("smartphone", "cedar-home")).toEqual([]);
    expect(getVariants("smartphone", "aurora-mobile", "am-pro-7").map((v) => v.id)).toEqual(["128gb", "256gb"]);
    expect(getAssetDetail({ productType: "smartphone", manufacturer: "aurora-mobile", model: "am-lite-5", variant: "64gb" })).toMatchObject({ category: "Consumer electronics", subCategory: "Mobile phones", pricePaise: 1_299_900 });
    expect(getAssetDetail({ productType: "smartphone", manufacturer: "bluepeak", model: "am-lite-5", variant: "64gb" })).toBeNull();
  });
  it("resets incompatible lower levels when a parent changes, and keeps compatible ones", () => {
    const full = { productType: "smartphone", manufacturer: "aurora-mobile", model: "am-lite-5", variant: "128gb" };
    const m = selectLevel(full, "manufacturer", "bluepeak");
    expect(m).toEqual({ productType: "smartphone", manufacturer: "bluepeak", model: "", variant: "" });
    const t = selectLevel(full, "productType", "television");
    expect(t).toEqual({ productType: "television", manufacturer: "", model: "", variant: "" });
    const same = selectLevel(full, "model", "am-pro-7");
    expect(same).toEqual({ ...full, model: "am-pro-7", variant: "128gb" }); // 128 GB exists on the Pro 7 too
    const gone = selectLevel(full, "model", "am-pro-7");
    expect(getVariants("smartphone", "aurora-mobile", gone.model).some((v) => v.id === gone.variant)).toBe(true);
    expect(selectLevel({ ...full, variant: "64gb" }, "model", "am-pro-7").variant).toBe(""); // 64 GB is not on the Pro 7
  });
  it("evaluates scheme eligibility from data, never promising approval", () => {
    const ctx = { assetPricePaise: 1_299_900, stepUp: "no" as const, suspectedActivity: "no" as const };
    const by = Object.fromEntries(getAvailableSchemes(ctx).map((s) => [s.scheme.id, s.eligibility.status]));
    expect(by).toEqual({ "std-6": "eligible", "std-12": "eligible", "std-18": "not_eligible", "step-12": "not_eligible" });
    expect(evaluateScheme(getScheme("step-12")!, { ...ctx, assetPricePaise: 2_000_000, stepUp: "yes" }).status).toBe("review_required");
    expect(evaluateScheme(getScheme("step-12")!, { ...ctx, assetPricePaise: 2_000_000, stepUp: "no" }).reasons[0]).toContain("did not choose");
    expect(evaluateScheme(getScheme("std-12")!, { ...ctx, suspectedActivity: "yes" }).status).toBe("review_required");
    expect(evaluateScheme(getScheme("std-12")!, { ...ctx, suspectedActivity: "" }).status).toBe("eligible");
  });
  it("totals add-ons from the price table and ignores unknown ids", () => {
    expect(addOnsSubtotalPaise([])).toBe(0);
    expect(addOnsSubtotalPaise([{ id: "care-plan", optionId: "12m" }, { id: "setup", optionId: "once" }])).toBe(149_900 + 49_900);
    expect(addOnsSubtotalPaise([{ id: "nope", optionId: "x" }, { id: "care-plan", optionId: "99m" }])).toBe(0);
  });
});
