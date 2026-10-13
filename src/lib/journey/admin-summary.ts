import { maskEmail, maskMobile, maskName } from "./mask";
import { deriveJourney, nextStep, overallStatus, STEPS, stepDef, type OverallStatus } from "./machine";
import { STEP_IDS, type JourneyDraft, type StepId, type StepStatus } from "./types";

// Admin-facing summary of a journey draft. It deliberately contains no raw PAN, no full DOB, no street address, no
// contact details in full, no income, no OTP, no photo and no document content: only what an operator needs.

export type AdminJourneyRow = {
  reference: string;
  applicant: string;
  createdAt: string;
  updatedAt: string;
  currentStep: StepId | "done";
  currentStepLabel: string;
  overall: OverallStatus;
  steps: Record<StepId, StepStatus>;
  reviewFlags: { step: StepId; label: string; reason: string }[];
};

export function summarizeDraft(d: JourneyDraft, today: Date = new Date()): AdminJourneyRow {
  const j = deriveJourney(d, today);
  const next = nextStep(j);
  const steps = Object.fromEntries(STEP_IDS.map((id) => [id, j[id].status])) as Record<StepId, StepStatus>;
  return {
    reference: d.reference,
    applicant: maskName(d.personal.firstName, d.personal.lastName),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    currentStep: next,
    currentStepLabel: next === "done" ? "All steps passed" : stepDef(next).label,
    overall: overallStatus(j, d),
    steps,
    reviewFlags: STEPS.filter((s) => j[s.id].status === "review_required").map((s) => ({ step: s.id, label: s.label, reason: j[s.id].reasons[0] ?? "Marked for review" })),
  };
}

export type AdminFilters = { q: string; overall: "" | OverallStatus; step: "" | StepId | "done"; from: string; to: string };
export const NO_FILTERS: AdminFilters = { q: "", overall: "", step: "", from: "", to: "" };

/** Reference search is case-insensitive substring; dates are inclusive yyyy-mm-dd bounds on the created date (UTC). */
export function matchesFilters(r: AdminJourneyRow, f: AdminFilters): boolean {
  if (f.q.trim() && !r.reference.toLowerCase().includes(f.q.trim().toLowerCase())) return false;
  if (f.overall && r.overall !== f.overall) return false;
  if (f.step && r.currentStep !== f.step) return false;
  const created = r.createdAt.slice(0, 10);
  if (f.from && created < f.from) return false;
  if (f.to && created > f.to) return false;
  return true;
}

export type AdminJourneyDetail = {
  row: AdminJourneyRow;
  basic: { mobile: string; panMasked: string; mobileStatus: string; panStatus: string; ageYears: number | null };
  kyc: { status: string; consent: boolean; verifiedAt?: string; source: string };
  demographics: { applicant: string; email: string; requestedAmountRupees: number | null; employmentType: string; city: string; state: string; pin: string; deliverySame: string; matchesDocument: string; substeps: Record<"personal" | "address" | "asset", boolean> };
  asset: { productType: string; manufacturer: string; model: string; variant: string; suspectedActivity: string; stepUp: string };
  liveness: { consent: boolean; source: string; outcome: string; demoScorePct?: number };
  offer: { status: string; eligibleAmountRupees?: number; annualRateBps?: number; tenureMonths?: number; emiPaise?: number; source?: string };
  scheme: string;
  addons: { id: string; optionId: string }[];
  addonsConfirmed: boolean;
  calculation: { totalFinancedPaise?: number; emiPaise?: number; tenureMonths?: number; totalPayablePaise?: number; confirmed: boolean };
};

export function detailOf(d: JourneyDraft, today: Date = new Date()): AdminJourneyDetail {
  const j = deriveJourney(d, today);
  const dob = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.basic.dob);
  let age: number | null = null;
  if (dob) {
    age = today.getUTCFullYear() - Number(dob[1]);
    if (today.getUTCMonth() + 1 < Number(dob[2]) || (today.getUTCMonth() + 1 === Number(dob[2]) && today.getUTCDate() < Number(dob[3]))) age -= 1;
  }
  const o = d.offer.offer;
  return {
    row: summarizeDraft(d, today),
    basic: { mobile: maskMobile(d.basic.mobile), panMasked: d.basic.panMasked || "-", mobileStatus: d.basic.mobileStatus, panStatus: d.basic.panStatus, ageYears: age },
    kyc: { status: d.kyc.status, consent: d.kyc.consent, verifiedAt: d.kyc.verifiedAt, source: d.kyc.documentSource },
    demographics: {
      applicant: maskName(d.personal.firstName, d.personal.lastName),
      email: maskEmail(d.personal.email),
      requestedAmountRupees: d.personal.requestedAmount,
      employmentType: d.personal.employmentType,
      city: d.address.city, state: d.address.state, pin: d.address.pin,
      deliverySame: d.address.deliverySame, matchesDocument: d.address.matchesDocument,
      substeps: { personal: j.demographicSubsteps.personal.complete, address: j.demographicSubsteps.address.complete, asset: j.demographicSubsteps.asset.complete },
    },
    asset: { ...d.asset },
    liveness: { consent: d.liveness.consent, source: d.liveness.source, outcome: d.liveness.result?.outcome ?? "none", demoScorePct: d.liveness.result?.demoScorePct },
    offer: o ? { status: o.status, eligibleAmountRupees: o.eligibleAmountRupees, annualRateBps: o.annualRateBps, tenureMonths: o.tenureMonths, emiPaise: o.emiPaise, source: o.source } : { status: "not_requested" },
    scheme: d.schemeId,
    addons: d.addons.selected,
    addonsConfirmed: d.addons.confirmed,
    calculation: {
      totalFinancedPaise: d.calculation.result?.financedAmountPaise, emiPaise: d.calculation.result?.emiPaise,
      tenureMonths: d.calculation.result?.tenureMonths, totalPayablePaise: d.calculation.result?.totalPayablePaise, confirmed: Boolean(d.calculation.confirmedAt),
    },
  };
}
