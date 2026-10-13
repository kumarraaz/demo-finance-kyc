import { looksLikeIdentityNumber } from "../validation";
import { STEP_IDS, type AddressFields, type JourneyDraft } from "./types";

const emptyAddress = (): AddressFields => ({ line1: "", line2: "", landmark: "", city: "", state: "", pin: "", country: "India" });

export function createEmptyDraft(reference: string, now: Date = new Date()): JourneyDraft {
  const ts = now.toISOString();
  return {
    schemaVersion: 1,
    reference,
    createdAt: ts,
    updatedAt: ts,
    currentStep: "basic",
    visited: {},
    basic: { mobile: "", dob: "", panName: "", panMasked: "", panFormatValid: false, fictionalConfirmed: false, mobileStatus: "not_started", panStatus: "not_started" },
    kyc: { consent: false, status: "not_started", documentSource: "Demo adapter (not DigiLocker)" },
    personal: {
      firstName: "", middleName: "", lastName: "", email: "", requestedAmount: null, maritalStatus: "", relation: "",
      fatherFirstName: "", fatherMiddleName: "", fatherLastName: "", employmentType: "", businessName: "", employerName: "",
      monthlyIncome: null, employmentDurationMonths: null,
    },
    address: { ...emptyAddress(), deliverySame: "", delivery: emptyAddress(), matchesDocument: "" },
    asset: { productType: "", manufacturer: "", model: "", variant: "", suspectedActivity: "", stepUp: "" },
    liveness: { consent: false, source: "", captured: false },
    offer: { inputKey: "", acknowledged: false },
    schemeId: "",
    addons: { selected: [], confirmed: false },
    calculation: {},
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Deep-merge stored JSON over a fresh draft. Unknown keys are dropped and values of the wrong type fall back to the
 * default, so an old or hand-edited draft can never crash a page or inject a new field.
 */
function mergeInto<T>(base: T, stored: unknown): T {
  if (!isObject(stored) || !isObject(base)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base)) {
    const b = (base as Record<string, unknown>)[key];
    const s = stored[key];
    if (s === undefined) continue;
    if (isObject(b)) out[key] = mergeInto(b, s);
    else if (Array.isArray(b)) out[key] = Array.isArray(s) ? s : b;
    else if (b === null) out[key] = s === null || typeof s === "number" ? s : b;
    else if (typeof b === typeof s) out[key] = s;
  }
  return out as T;
}

/** Optional keys (not in the empty draft) that are safe to restore if they have the right shape. */
function restoreOptionals(draft: JourneyDraft, s: Record<string, unknown>) {
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  if (isObject(s.kyc)) {
    draft.kyc.requestedAt = str(s.kyc.requestedAt);
    draft.kyc.verifiedAt = str(s.kyc.verifiedAt);
    draft.kyc.attemptsLeft = num(s.kyc.attemptsLeft);
    draft.kyc.resendAvailableAt = str(s.kyc.resendAvailableAt);
    draft.kyc.documentSummary = str(s.kyc.documentSummary);
  }
  if (isObject(s.liveness)) {
    draft.liveness.capturedAt = str(s.liveness.capturedAt);
    const r = s.liveness.result;
    if (isObject(r) && (r.outcome === "demo_passed" || r.outcome === "demo_review" || r.outcome === "demo_failed") && num(r.demoScorePct) !== undefined && str(r.completedAt)) {
      draft.liveness.result = { outcome: r.outcome, demoScorePct: r.demoScorePct as number, completedAt: r.completedAt as string };
    }
  }
  if (isObject(s.offer)) {
    draft.offer.fetchedAt = str(s.offer.fetchedAt);
    if (isObject(s.offer.offer)) draft.offer.offer = s.offer.offer as unknown as NonNullable<JourneyDraft["offer"]["offer"]>;
  }
  if (isObject(s.calculation)) {
    draft.calculation.confirmedAt = str(s.calculation.confirmedAt);
    if (isObject(s.calculation.result)) draft.calculation.result = s.calculation.result as unknown as NonNullable<JourneyDraft["calculation"]["result"]>;
  }
  draft.completedAt = str(s.completedAt);
  if (isObject(s.visited)) {
    for (const k of STEP_IDS) if (s.visited[k] === true) draft.visited[k] = true;
  }
  if (isObject(s.addons) && Array.isArray(s.addons.selected)) {
    draft.addons.selected = s.addons.selected
      .filter((x): x is { id: string; optionId: string } => isObject(x) && typeof x.id === "string" && typeof x.optionId === "string")
      .map((x) => ({ id: x.id, optionId: x.optionId }));
  }
}

/** Rebuild a draft from stored JSON. Returns null when it is not a version-1 draft with a reference. */
export function parseDraft(json: unknown, fallbackNow: Date = new Date()): JourneyDraft | null {
  if (!isObject(json) || json.schemaVersion !== 1 || typeof json.reference !== "string" || !json.reference) return null;
  const base = createEmptyDraft(json.reference, fallbackNow);
  const merged = mergeInto(base, json);
  // visited, add-ons and the optional keys are restored explicitly (only known, correctly typed values).
  merged.visited = {};
  merged.reference = json.reference;
  restoreOptionals(merged, json);
  return merged;
}

/**
 * Last line of defence before anything is written to browser storage: any string that looks like a PAN or an
 * Aadhaar number is blanked. The masked PAN contains asterisks, so it never matches. Returns the cleaned
 * draft and whether anything had to be removed.
 */
export function scrubDraft(draft: JourneyDraft): { draft: JourneyDraft; removed: number } {
  let removed = 0;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (looksLikeIdentityNumber(v)) {
        removed += 1;
        return "";
      }
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (isObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  const cleaned = walk(draft) as JourneyDraft;
  // The reference and timestamps are ours and can never be identity numbers.
  cleaned.reference = draft.reference;
  cleaned.createdAt = draft.createdAt;
  cleaned.updatedAt = draft.updatedAt;
  return { draft: cleaned, removed };
}
