import { divRound, mulBps, paiseToNumber, toPaise, type Paise } from "./money";

// Illustrative EMI and total-cost maths. These are estimates, not lender terms.
// The (1+r)^n term is computed with 18-digit fixed-point BigInt arithmetic so results are exact to the paisa
// for realistic inputs and identical on every device.

const SCALE = 10n ** 18n;

function powScaled(baseScaled: bigint, n: number): bigint {
  let acc = SCALE;
  for (let i = 0; i < n; i++) acc = (acc * baseScaled) / SCALE;
  return acc;
}

export const MAX_TENURE_MONTHS = 120;

/** Equated monthly instalment in paise, rounded half up. */
export function computeEmi(principal: Paise, annualRateBps: number, months: number): Paise {
  if (principal <= 0n) throw new RangeError("Principal must be positive");
  if (!Number.isInteger(months) || months < 1 || months > MAX_TENURE_MONTHS) throw new RangeError("Tenure must be 1 to 120 months");
  if (!Number.isInteger(annualRateBps) || annualRateBps < 0 || annualRateBps > 10_000) throw new RangeError("Rate must be 0 to 100 percent");
  if (annualRateBps === 0) return divRound(principal, BigInt(months));
  const r = (BigInt(annualRateBps) * SCALE) / 120_000n; // monthly rate, scaled
  const pow = powScaled(SCALE + r, months);
  const num = principal * r * pow;
  const den = (pow - SCALE) * SCALE;
  return divRound(num, den);
}

export type CalcInput = {
  assetPriceRupees: number;
  addOnsRupees: number;
  downPaymentBps: number;
  annualRateBps: number;
  tenureMonths: number;
  processingFeeBps: number;
  minProcessingFeeRupees: number;
  gstBps: number;
};

/** All amounts are integer paise stored as numbers. */
export type CalcResult = {
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
  /** All EMIs plus processing fee and tax. Excludes the down payment. */
  totalPayablePaise: number;
  /** Down payment plus total payable. */
  totalCostPaise: number;
};

export function calculateFinal(input: CalcInput): CalcResult {
  const asset = toPaise(input.assetPriceRupees);
  const addOns = toPaise(input.addOnsRupees);
  if (asset <= 0n) throw new RangeError("Asset price must be positive");
  const down = mulBps(asset, input.downPaymentBps);
  const financed = asset + addOns - down;
  if (financed <= 0n) throw new RangeError("Financed amount must be positive");
  const emi = computeEmi(financed, input.annualRateBps, input.tenureMonths);
  const totalEmi = emi * BigInt(input.tenureMonths);
  const interest = totalEmi > financed ? totalEmi - financed : 0n;
  const rawFee = mulBps(financed, input.processingFeeBps);
  const minFee = toPaise(input.minProcessingFeeRupees);
  const fee = rawFee > minFee ? rawFee : minFee;
  const tax = mulBps(fee, input.gstBps);
  const fees = fee + tax;
  const payable = totalEmi + fees;
  return {
    assetPricePaise: paiseToNumber(asset),
    addOnsPaise: paiseToNumber(addOns),
    downPaymentPaise: paiseToNumber(down),
    financedAmountPaise: paiseToNumber(financed),
    annualRateBps: input.annualRateBps,
    tenureMonths: input.tenureMonths,
    emiPaise: paiseToNumber(emi),
    totalEmiPaise: paiseToNumber(totalEmi),
    totalInterestPaise: paiseToNumber(interest),
    processingFeePaise: paiseToNumber(fee),
    taxOnFeesPaise: paiseToNumber(tax),
    totalFeesPaise: paiseToNumber(fees),
    totalPayablePaise: paiseToNumber(payable),
    totalCostPaise: paiseToNumber(down + payable),
  };
}

export type IndicativeTerms = {
  principalPaise: number;
  annualRateBps: number;
  tenureMonths: number;
  emiPaise: number;
  processingFeePaise: number;
  taxOnFeesPaise: number;
  totalPayablePaise: number;
};

/** Offer-style terms for a plain principal (no asset, no down payment). */
export function calculateIndicative(
  principalRupees: number,
  p: { annualRateBps: number; tenureMonths: number; processingFeeBps: number; minProcessingFeeRupees: number; gstBps: number },
): IndicativeTerms {
  const principal = toPaise(principalRupees);
  const emi = computeEmi(principal, p.annualRateBps, p.tenureMonths);
  const rawFee = mulBps(principal, p.processingFeeBps);
  const minFee = toPaise(p.minProcessingFeeRupees);
  const fee = rawFee > minFee ? rawFee : minFee;
  const tax = mulBps(fee, p.gstBps);
  return {
    principalPaise: paiseToNumber(principal),
    annualRateBps: p.annualRateBps,
    tenureMonths: p.tenureMonths,
    emiPaise: paiseToNumber(emi),
    processingFeePaise: paiseToNumber(fee),
    taxOnFeesPaise: paiseToNumber(tax),
    totalPayablePaise: paiseToNumber(emi * BigInt(p.tenureMonths) + fee + tax),
  };
}
