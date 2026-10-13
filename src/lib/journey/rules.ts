// Business rules for the DEMO journey, in one place so a lender workflow can replace them later.
// Nothing here is a real lending policy: every number is an illustrative placeholder.
export type JourneyRules = {
  mobilePattern: RegExp;
  age: { min: number; max: number };
  /** Requested loan amount in rupees. */
  loan: { min: number; max: number };
  /** Monthly income / salary in rupees. */
  income: { min: number; max: number };
  employmentDurationMonths: { min: number; max: number };
  otp: { length: number; resendSeconds: number; maxAttempts: number; demoCode: string };
  /** Illustrative offer fixture. Set `enabled: false` to see the "Offer integration pending" screen. */
  offer: {
    enabled: boolean;
    incomeMultiple: number;
    minEligibleAmount: number;
    annualRateBps: number;
    tenureMonths: number;
    processingFeeBps: number;
    minProcessingFee: number;
    gstBps: number;
  };
  /** Demo outcome of the simulated liveness check: "pass", "review" or "fail". */
  livenessFixture: "pass" | "review" | "fail";
  /** Fixed, clearly labelled demo score. Never computed from a face. */
  livenessDemoScorePct: number;
  draftTtlDays: number;
};

export const DEFAULT_RULES: JourneyRules = {
  mobilePattern: /^[6-9]\d{9}$/,
  age: { min: 18, max: 70 },
  loan: { min: 10_000, max: 5_000_000 },
  income: { min: 1, max: 10_000_000 },
  employmentDurationMonths: { min: 0, max: 600 },
  otp: { length: 6, resendSeconds: 30, maxAttempts: 3, demoCode: "123456" },
  offer: {
    enabled: true,
    incomeMultiple: 10,
    minEligibleAmount: 10_000,
    annualRateBps: 1600,
    tenureMonths: 12,
    processingFeeBps: 200,
    minProcessingFee: 0,
    gstBps: 1800,
  },
  livenessFixture: "pass",
  livenessDemoScorePct: 92,
  draftTtlDays: 7,
};
