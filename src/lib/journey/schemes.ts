// FICTIONAL demo schemes. These are not lender products and imply no approval.
// Eligibility is data-driven so a lender integration can supply real rules (SchemeProvider).
import type { YesNo } from "./types";

export type DemoScheme = {
  id: string;
  name: string;
  kind: "standard" | "step_up";
  description: string;
  tenureMonths: number;
  annualRateBps: number;
  downPaymentBps: number;
  minAssetPricePaise: number;
};

export const DEMO_SCHEMES: DemoScheme[] = [
  { id: "std-6", name: "Standard 6 months (demo)", kind: "standard", description: "Short tenure, higher EMI.", tenureMonths: 6, annualRateBps: 1500, downPaymentBps: 1000, minAssetPricePaise: 5_000_00 },
  { id: "std-12", name: "Standard 12 months (demo)", kind: "standard", description: "Balanced tenure and EMI.", tenureMonths: 12, annualRateBps: 1600, downPaymentBps: 1000, minAssetPricePaise: 5_000_00 },
  { id: "std-18", name: "Standard 18 months (demo)", kind: "standard", description: "Longer tenure, lower EMI.", tenureMonths: 18, annualRateBps: 1700, downPaymentBps: 1500, minAssetPricePaise: 20_000_00 },
  {
    id: "step-12",
    name: "Step-up 12 months (demo)",
    kind: "step_up",
    description: "Illustrative step-up scheme. A real step-up schedule needs a lender integration; this demo shows level EMIs.",
    tenureMonths: 12,
    annualRateBps: 1400,
    downPaymentBps: 2000,
    minAssetPricePaise: 10_000_00,
  },
];

export type SchemeContext = { assetPricePaise: number; stepUp: YesNo; suspectedActivity: YesNo };
export type SchemeEligibility = { status: "eligible" | "review_required" | "not_eligible"; reasons: string[] };

export function evaluateScheme(scheme: DemoScheme, ctx: SchemeContext): SchemeEligibility {
  const reasons: string[] = [];
  if (ctx.assetPricePaise < scheme.minAssetPricePaise) {
    return { status: "not_eligible", reasons: [`The asset price is below this scheme's demo minimum.`] };
  }
  if (scheme.kind === "step_up" && ctx.stepUp !== "yes") {
    return { status: "not_eligible", reasons: [`You did not choose to apply for step-up schemes.`] };
  }
  if (scheme.kind === "step_up") reasons.push("Step-up schemes need a lender review before they can be offered.");
  if (ctx.suspectedActivity === "yes") reasons.push("Your suspected-activity answer sends this application for review.");
  return { status: reasons.length > 0 ? "review_required" : "eligible", reasons };
}

export function getAvailableSchemes(ctx: SchemeContext) {
  return DEMO_SCHEMES.map((scheme) => ({ scheme, eligibility: evaluateScheme(scheme, ctx) }));
}

export function getScheme(id: string): DemoScheme | undefined {
  return DEMO_SCHEMES.find((s) => s.id === id);
}
