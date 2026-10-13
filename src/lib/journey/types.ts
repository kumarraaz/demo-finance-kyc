// Typed model of one customer application draft in the DEMO journey (Phase 1, frontend only).
// What is deliberately NOT in this model: a raw PAN, any Aadhaar data, OTPs, tokens, or face images.

export const STEP_IDS = ["basic", "kyc", "demographics", "liveness", "offer", "asset", "addons", "calculation"] as const;
export type StepId = (typeof STEP_IDS)[number];

export type StepStatus = "pending" | "in_progress" | "completed" | "review_required" | "failed";

/** Mobile and PAN verification (simulated in Phase 1). */
export type VerificationStatus = "not_started" | "pending" | "demo_verified" | "failed" | "integration_required";

export type KycStatus =
  | "not_started"
  | "consent_required"
  | "request_pending"
  | "demo_otp_issued"
  | "demo_verified"
  | "cancelled"
  | "failed"
  | "integration_required";

export type YesNo = "" | "yes" | "no";
export type EmploymentType = "" | "self_employed" | "salaried";

export type BasicDetails = {
  mobile: string;
  dob: string; // yyyy-mm-dd
  panName: string;
  /** Masked on entry. The raw PAN is held in memory by the form only and is never part of the draft. */
  panMasked: string;
  panFormatValid: boolean;
  fictionalConfirmed: boolean;
  mobileStatus: VerificationStatus;
  panStatus: VerificationStatus;
};

export type KycDetails = {
  consent: boolean;
  status: KycStatus;
  requestedAt?: string;
  verifiedAt?: string;
  attemptsLeft?: number;
  resendAvailableAt?: string;
  /** Placeholder only. No identity document content is ever stored. */
  documentSource: string;
  documentSummary?: string;
};

export type PersonalDetails = {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  requestedAmount: number | null;
  maritalStatus: string;
  relation: string;
  fatherFirstName: string;
  fatherMiddleName: string;
  fatherLastName: string;
  employmentType: EmploymentType;
  businessName: string;
  employerName: string;
  /** Monthly income (self employed) or monthly salary (salaried), in rupees. */
  monthlyIncome: number | null;
  employmentDurationMonths: number | null;
};

export type AddressFields = { line1: string; line2: string; landmark: string; city: string; state: string; pin: string; country: string };

export type AddressDetails = AddressFields & {
  deliverySame: YesNo;
  delivery: AddressFields;
  matchesDocument: YesNo;
};

export type AssetSelection = {
  productType: string;
  manufacturer: string;
  model: string;
  variant: string;
  suspectedActivity: YesNo;
  stepUp: YesNo;
};

export type LivenessDetails = {
  consent: boolean;
  /** "placeholder" = the user chose the simulated path because no camera was available. */
  source: "" | "camera" | "placeholder";
  captured: boolean;
  capturedAt?: string;
  /** Result of the DEMO fixture. Never a real match. */
  result?: { outcome: "demo_passed" | "demo_review" | "demo_failed"; demoScorePct: number; completedAt: string };
};

export type OfferStatus = "not_requested" | "eligible" | "review_required" | "not_eligible" | "integration_required";

export type IndicativeOffer = {
  status: Exclude<OfferStatus, "not_requested">;
  requestedAmountRupees: number;
  eligibleAmountRupees: number;
  annualRateBps: number;
  tenureMonths: number;
  emiPaise: number;
  processingFeePaise: number;
  taxOnFeesPaise: number;
  totalPayablePaise: number;
  reasons: string[];
  /** Fixture identifier shown to the user as the source of these figures. */
  source: string;
};

export type OfferState = {
  /** Which inputs the stored offer was computed from. A mismatch makes it stale. */
  inputKey: string;
  offer?: IndicativeOffer;
  acknowledged: boolean;
  fetchedAt?: string;
};

export type AddOnSelection = { id: string; optionId: string };

export type FinalCalculation = {
  inputKey: string;
  schemeId: string;
  computedAt: string;
  assetPricePaise: number;
  addOnsPaise: number;
  downPaymentPaise: number;
  financedAmountPaise: number;
  annualRateBps: number;
  tenureMonths: number;
  emiPaise: number;
  totalEmiPaise: number;
  totalInterestPaise: number;
  processingFeePaise: number;
  taxOnFeesPaise: number;
  totalFeesPaise: number;
  totalPayablePaise: number;
  totalCostPaise: number;
};

export type JourneyDraft = {
  schemaVersion: 1;
  reference: string;
  createdAt: string;
  updatedAt: string;
  currentStep: StepId;
  /** Screens the user has opened. Used only for "In Progress"; completion is derived from data. */
  visited: Partial<Record<StepId, true>>;
  basic: BasicDetails;
  kyc: KycDetails;
  personal: PersonalDetails;
  address: AddressDetails;
  asset: AssetSelection;
  liveness: LivenessDetails;
  offer: OfferState;
  schemeId: string;
  addons: { selected: AddOnSelection[]; confirmed: boolean };
  calculation: { result?: FinalCalculation; confirmedAt?: string };
  completedAt?: string;
};

export type Errors = Record<string, string>;
