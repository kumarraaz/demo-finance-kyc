import { createEmptyDraft } from "@/lib/journey/draft";
import { buildCalculation } from "@/lib/journey/final";
import { offerInputKey } from "@/lib/journey/machine";
import { createDemoOfferProvider } from "@/lib/journey/providers/demo-offer";
import { DEFAULT_RULES } from "@/lib/journey/rules";
import type { JourneyDraft } from "@/lib/journey/types";

export const TODAY = new Date("2026-10-13T10:00:00.000Z");
export const NOW_ISO = TODAY.toISOString();

/** Fully valid FICTIONAL draft with every step passed. Callers override pieces to test one rule at a time. */
export async function completeDraft(overrides: (d: JourneyDraft) => void = () => {}): Promise<JourneyDraft> {
  const d = createEmptyDraft("DFK-ABCDE-FGHJK", TODAY);
  d.basic = { mobile: "9000000001", dob: "1990-05-15", panName: "Test Applicant", panMasked: "AB******4F", panFormatValid: true, fictionalConfirmed: true, mobileStatus: "demo_verified", panStatus: "demo_verified" };
  d.kyc = { consent: true, status: "demo_verified", documentSource: "Demo adapter (not DigiLocker)", verifiedAt: NOW_ISO };
  d.personal = {
    firstName: "Asha", middleName: "", lastName: "Verma", email: "asha@example.com", requestedAmount: 50_000, maritalStatus: "single", relation: "daughter_of",
    fatherFirstName: "Ravi", fatherMiddleName: "", fatherLastName: "Verma", employmentType: "salaried", businessName: "", employerName: "Demo Works Pvt Ltd",
    monthlyIncome: 40_000, employmentDurationMonths: 24,
  };
  d.address = {
    line1: "12 Demo Street", line2: "", landmark: "", city: "Pune", state: "Maharashtra", pin: "411001", country: "India",
    deliverySame: "yes", delivery: { line1: "", line2: "", landmark: "", city: "", state: "", pin: "", country: "India" }, matchesDocument: "yes",
  };
  d.asset = { productType: "smartphone", manufacturer: "aurora-mobile", model: "am-lite-5", variant: "128gb", suspectedActivity: "no", stepUp: "no" };
  d.liveness = { consent: true, source: "camera", captured: true, capturedAt: NOW_ISO, result: { outcome: "demo_passed", demoScorePct: 92, completedAt: NOW_ISO } };
  const offer = await createDemoOfferProvider().getIndicativeOffer({ requestedAmountRupees: 50_000, monthlyIncomeRupees: 40_000 });
  if (offer.status === "integration_required") throw new Error("fixture offer unavailable");
  d.offer = { inputKey: offerInputKey(d), offer, acknowledged: true, fetchedAt: NOW_ISO };
  d.schemeId = "std-12";
  d.addons = { selected: [], confirmed: true };
  const built = buildCalculation(d, DEFAULT_RULES, TODAY);
  if (!built.ok) throw new Error("fixture calculation failed");
  d.calculation = { result: built.result, confirmedAt: NOW_ISO };
  for (const id of ["basic", "kyc", "demographics", "liveness", "offer", "asset", "addons", "calculation"] as const) d.visited[id] = true;
  overrides(d);
  return d;
}
