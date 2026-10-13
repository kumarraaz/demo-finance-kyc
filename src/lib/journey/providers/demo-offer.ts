import { calculateIndicative } from "../calc";
import { DEFAULT_RULES, type JourneyRules } from "../rules";
import type { OfferProvider } from "./types";

export const DEMO_OFFER_SOURCE = "Demo fixture (not a lender offer)";

/**
 * DEMO offer adapter: an illustrative fixture driven by the rules in rules.ts. It does not consult a credit bureau and
 * is not an eligibility decision. With `rules.offer.enabled = false` it reports "integration required" instead.
 */
export function createDemoOfferProvider(rules: JourneyRules = DEFAULT_RULES): OfferProvider {
  return {
    meta: { id: "offer-demo", name: "Demo offer fixture", mode: "demo" },
    async getIndicativeOffer({ requestedAmountRupees, monthlyIncomeRupees }) {
      const r = rules.offer;
      if (!r.enabled) return { status: "integration_required", reasons: ["No lender offer integration is connected."], source: DEMO_OFFER_SOURCE };
      const cap = Math.floor(monthlyIncomeRupees * r.incomeMultiple);
      if (cap < r.minEligibleAmount) {
        return {
          status: "not_eligible",
          requestedAmountRupees,
          eligibleAmountRupees: 0,
          annualRateBps: r.annualRateBps,
          tenureMonths: r.tenureMonths,
          emiPaise: 0,
          processingFeePaise: 0,
          taxOnFeesPaise: 0,
          totalPayablePaise: 0,
          reasons: ["In this demo fixture the stated income is too low for an indicative amount. Check the income you entered."],
          source: DEMO_OFFER_SOURCE,
        };
      }
      const eligible = Math.min(requestedAmountRupees, cap);
      const terms = calculateIndicative(eligible, {
        annualRateBps: r.annualRateBps,
        tenureMonths: r.tenureMonths,
        processingFeeBps: r.processingFeeBps,
        minProcessingFeeRupees: r.minProcessingFee,
        gstBps: r.gstBps,
      });
      const reasons = eligible < requestedAmountRupees ? ["The requested amount is above the demo fixture's indicative amount. A reviewer would decide."] : [];
      return {
        status: reasons.length > 0 ? "review_required" : "eligible",
        requestedAmountRupees,
        eligibleAmountRupees: eligible,
        annualRateBps: terms.annualRateBps,
        tenureMonths: terms.tenureMonths,
        emiPaise: terms.emiPaise,
        processingFeePaise: terms.processingFeePaise,
        taxOnFeesPaise: terms.taxOnFeesPaise,
        totalPayablePaise: terms.totalPayablePaise,
        reasons,
        source: DEMO_OFFER_SOURCE,
      };
    },
  };
}
