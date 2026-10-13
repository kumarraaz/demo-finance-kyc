import { addOnsSubtotalPaise } from "./addons";
import { calculateFinal } from "./calc";
import { getAssetDetail } from "./catalog";
import { calculationInputKey, offerInputKey } from "./machine";
import { DEFAULT_RULES, type JourneyRules } from "./rules";
import { getScheme } from "./schemes";
import type { FinalCalculation, JourneyDraft, StepId } from "./types";

export type MissingInput = { message: string; step: StepId; path: string };
export type BuildResult = { ok: true; result: FinalCalculation } | { ok: false; missing: MissingInput[] };

/**
 * Assemble the final illustrative calculation from the saved draft. Nothing is invented: when an input is missing the
 * result lists exactly what is missing and which screen fixes it.
 */
export function buildCalculation(d: JourneyDraft, rules: JourneyRules = DEFAULT_RULES, now: Date = new Date()): BuildResult {
  const missing: MissingInput[] = [];
  const asset = getAssetDetail(d.asset);
  if (!asset) missing.push({ message: "Choose a product, manufacturer, model and variant.", step: "asset", path: "/apply/asset-scheme" });
  const scheme = d.schemeId ? getScheme(d.schemeId) : undefined;
  if (!scheme) missing.push({ message: "Choose a scheme.", step: "asset", path: "/apply/asset-scheme" });
  if (d.offer.offer === undefined || d.offer.inputKey !== offerInputKey(d)) {
    missing.push({ message: "Review the soft offer for your current answers.", step: "offer", path: "/apply/offer" });
  }
  if (!d.addons.confirmed) missing.push({ message: "Confirm your add-on selection (it can be none).", step: "addons", path: "/apply/add-ons" });
  if (missing.length > 0 || !asset || !scheme) return { ok: false, missing };

  const calc = calculateFinal({
    assetPriceRupees: asset.pricePaise / 100,
    addOnsRupees: addOnsSubtotalPaise(d.addons.selected) / 100,
    downPaymentBps: scheme.downPaymentBps,
    annualRateBps: scheme.annualRateBps,
    tenureMonths: scheme.tenureMonths,
    processingFeeBps: rules.offer.processingFeeBps,
    minProcessingFeeRupees: rules.offer.minProcessingFee,
    gstBps: rules.offer.gstBps,
  });
  return {
    ok: true,
    result: { ...calc, inputKey: calculationInputKey(d), schemeId: scheme.id, computedAt: now.toISOString() },
  };
}
