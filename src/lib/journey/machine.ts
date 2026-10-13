import { getAssetDetail } from "./catalog";
import { getScheme } from "./schemes";
import { STEP_IDS, type Errors, type JourneyDraft, type StepId, type StepStatus } from "./types";
import { hasErrors, validateAddress, validateAsset, validateBasic, validatePersonal } from "./validation";

// The application state machine. There is no stored "completed" flag per step: completion is DERIVED from the saved
// data (and the outcome of the provider call, where there is one), so a step cannot be completed by opening it.

export type StepDef = { id: StepId; label: string; path: string; description: string };

export const STEPS: StepDef[] = [
  { id: "basic", label: "Basic Details", path: "/apply/basic-details", description: "Mobile, date of birth and PAN" },
  { id: "kyc", label: "KYC Details", path: "/apply/kyc", description: "Document retrieval (demo)" },
  { id: "demographics", label: "Demographic Details", path: "/apply/demographics/personal", description: "Personal, address and asset details" },
  { id: "liveness", label: "Liveness Check", path: "/apply/liveness", description: "Selfie check (demo)" },
  { id: "offer", label: "Soft Offer", path: "/apply/offer", description: "Indicative offer (demo)" },
  { id: "asset", label: "Asset & Scheme Selection", path: "/apply/asset-scheme", description: "Choose the asset and a scheme" },
  { id: "addons", label: "Add-on Product", path: "/apply/add-ons", description: "Optional extras" },
  { id: "calculation", label: "Final Calculation Display", path: "/apply/calculation", description: "Itemised illustrative figures" },
];

export const DEMOGRAPHIC_SUBSTEPS = [
  { id: "personal", label: "Personal, family and employment", path: "/apply/demographics/personal" },
  { id: "address", label: "Address", path: "/apply/demographics/address" },
  { id: "asset", label: "Asset details", path: "/apply/demographics/asset" },
] as const;

export function stepDef(id: StepId): StepDef {
  return STEPS.find((s) => s.id === id)!;
}

/** Keys that decide whether a stored offer / calculation is still valid for the current answers. */
export function offerInputKey(d: JourneyDraft): string {
  return JSON.stringify([d.personal.requestedAmount, d.personal.monthlyIncome, d.personal.employmentType]);
}

export function calculationInputKey(d: JourneyDraft): string {
  return JSON.stringify([
    d.asset.productType, d.asset.manufacturer, d.asset.model, d.asset.variant, d.schemeId,
    d.addons.selected.map((s) => `${s.id}:${s.optionId}`).sort(), d.offer.inputKey,
  ]);
}

export type StepState = { status: StepStatus; reasons: string[] };
export type JourneyState = Record<StepId, StepState> & { demographicSubsteps: Record<"personal" | "address" | "asset", { complete: boolean; errors: Errors }> };

/** The country is pre-filled with "India", so it alone must not count as the user having started the form. */
function addressTouched(a: JourneyDraft["address"]): boolean {
  const { country: _c, delivery, ...rest } = a;
  const { country: _dc, ...deliveryRest } = delivery;
  void _c; void _dc;
  return hasAny(rest) || hasAny(deliveryRest);
}

function hasAny(o: object): boolean {
  return Object.values(o).some((v) => (typeof v === "string" ? v.trim() !== "" : typeof v === "number" ? true : typeof v === "boolean" ? v : v !== null && typeof v === "object" ? hasAny(v) : false));
}

export function deriveJourney(d: JourneyDraft, today: Date = new Date()): JourneyState {
  const touched = (id: StepId) => d.visited[id] === true;
  const st = (status: StepStatus, reasons: string[] = []): StepState => ({ status, reasons });

  // 1. Basic details
  const basicErrors = validateBasic({ ...d.basic }, today);
  const basicValid = !hasErrors(basicErrors);
  const basicDone = basicValid && d.basic.panStatus === "demo_verified" && d.basic.mobileStatus === "demo_verified";
  const basic: StepState = basicDone
    ? st("completed")
    : d.basic.panStatus === "failed" || d.basic.mobileStatus === "failed"
      ? st("failed", ["A demo verification failed. Correct the details and try again."])
      : touched("basic") || hasAny({ ...d.basic, mobileStatus: "", panStatus: "" }) ? st("in_progress") : st("pending");

  // 2. KYC
  const kycStatus = d.kyc.status;
  const kyc: StepState =
    kycStatus === "demo_verified" && d.kyc.consent
      ? st("completed")
      : kycStatus === "failed"
        ? st("failed", ["The demo verification failed. Request a new demo code."])
        : touched("kyc") || d.kyc.consent || kycStatus !== "not_started" ? st("in_progress") : st("pending");

  // 3. Demographics (three sub-steps)
  const personalErr = validatePersonal(d.personal);
  const addressErr = validateAddress(d.address);
  const assetErr = validateAsset(d.asset);
  const sub = {
    personal: { complete: !hasErrors(personalErr), errors: personalErr },
    address: { complete: !hasErrors(addressErr), errors: addressErr },
    asset: { complete: !hasErrors(assetErr), errors: assetErr },
  };
  const demoAll = sub.personal.complete && sub.address.complete && sub.asset.complete;
  const reviewReasons: string[] = [];
  if (demoAll && d.address.matchesDocument === "no") reviewReasons.push("The current address differs from the document address. A reviewer must confirm it.");
  if (demoAll && d.asset.suspectedActivity === "yes") reviewReasons.push("Suspected activity was declared. The case is marked for review.");
  const demographics: StepState = demoAll
    ? reviewReasons.length > 0 ? st("review_required", reviewReasons) : st("completed")
    : touched("demographics") || hasAny(d.personal) || addressTouched(d.address) || hasAny(d.asset) ? st("in_progress") : st("pending");

  // 4. Liveness
  const lv = d.liveness;
  const liveness: StepState =
    lv.consent && lv.result
      ? lv.result.outcome === "demo_passed" ? st("completed")
        : lv.result.outcome === "demo_review" ? st("review_required", ["The demo liveness result needs a human review."])
          : st("failed", ["The demo liveness check failed. Retake the photo."])
      : touched("liveness") || lv.consent || lv.captured ? st("in_progress") : st("pending");

  // 5. Offer (valid only for the answers it was computed from)
  const offerFresh = d.offer.offer !== undefined && d.offer.inputKey === offerInputKey(d);
  const o = offerFresh ? d.offer.offer! : undefined;
  const offer: StepState =
    o && d.offer.acknowledged && (o.status === "eligible" || o.status === "review_required")
      ? o.status === "review_required" ? st("review_required", o.reasons) : st("completed")
      : o && o.status === "not_eligible" ? st("failed", o.reasons)
        : o && o.status === "integration_required" ? st("pending", ["Offer integration is not connected."])
          : touched("offer") || o ? st("in_progress") : st("pending");

  // 6. Asset & scheme
  const scheme = d.schemeId ? getScheme(d.schemeId) : undefined;
  const assetOk = !hasErrors(assetErr) && getAssetDetail(d.asset) !== null;
  const asset: StepState =
    assetOk && scheme
      ? st("completed")
      : touched("asset") || scheme ? st("in_progress") : st("pending");

  // 7. Add-ons (completed only after the explicit confirmation, which may select nothing)
  const addons: StepState = d.addons.confirmed ? st("completed") : touched("addons") || d.addons.selected.length > 0 ? st("in_progress") : st("pending");

  // 8. Calculation
  const calc = d.calculation.result;
  const calculation: StepState =
    calc && d.calculation.confirmedAt && calc.inputKey === calculationInputKey(d) ? st("completed")
      : touched("calculation") || calc ? st("in_progress") : st("pending");

  const states = { basic, kyc, demographics, liveness, offer, asset, addons, calculation } as Record<StepId, StepState>;
  return { ...states, demographicSubsteps: sub };
}

const PASSED: StepStatus[] = ["completed", "review_required"];
export const isPassed = (s: StepStatus) => PASSED.includes(s);

/** A step can be opened once every step before it has passed. The first step is always open. */
export function isStepAvailable(id: StepId, j: JourneyState): boolean {
  const idx = STEP_IDS.indexOf(id);
  return STEP_IDS.slice(0, idx).every((p) => isPassed(j[p].status));
}

/** The first step that has not passed yet, or "done". */
export function nextStep(j: JourneyState): StepId | "done" {
  return STEP_IDS.find((id) => !isPassed(j[id].status)) ?? "done";
}

export type OverallStatus = "not_started" | "in_progress" | "review_required" | "failed" | "completed";

export function overallStatus(j: JourneyState, d: JourneyDraft): OverallStatus {
  const all = STEP_IDS.map((id) => j[id].status);
  if (all.some((s) => s === "failed")) return "failed";
  if (all.every(isPassed)) return all.includes("review_required") ? "review_required" : "completed";
  if (all.every((s) => s === "pending") && Object.keys(d.visited).length === 0) return "not_started";
  return all.includes("review_required") ? "review_required" : "in_progress";
}

export function progressPercent(j: JourneyState): number {
  return Math.round((STEP_IDS.filter((id) => isPassed(j[id].status)).length / STEP_IDS.length) * 100);
}

/** Mark a screen as opened. Only affects "In Progress"; never completion. */
export function markVisited(d: JourneyDraft, id: StepId, now: Date = new Date()): JourneyDraft {
  if (d.visited[id]) return d;
  return { ...d, visited: { ...d.visited, [id]: true }, updatedAt: now.toISOString() };
}
