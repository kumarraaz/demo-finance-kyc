import { describe, expect, it } from "vitest";
import { calculateFinal, calculateIndicative, computeEmi } from "@/lib/journey/calc";
import { divRound, formatPaise, formatRupees, mulBps, paiseToNumber, toPaise } from "@/lib/journey/money";

describe("money", () => {
  it("converts rupees to integer paise without float drift", () => {
    expect(toPaise(0.1) + toPaise(0.2)).toBe(toPaise(0.3)); // 0.1 + 0.2 !== 0.3 in binary floating point
    expect(toPaise(1999.99)).toBe(199999n);
    expect(() => toPaise(NaN)).toThrow(RangeError);
    expect(() => toPaise(Infinity)).toThrow(RangeError);
    expect(() => toPaise(1e20)).toThrow(RangeError);
  });
  it("rounds basis-point shares and divisions half up", () => {
    expect(mulBps(10_000n, 1800)).toBe(1800n);
    expect(mulBps(1n, 5000)).toBe(1n); // 0.5 rounds up
    expect(mulBps(1n, 4999)).toBe(0n);
    expect(divRound(7n, 2n)).toBe(4n);
    expect(divRound(5n, 3n)).toBe(2n);
    expect(paiseToNumber(123n)).toBe(123);
  });
  it("formats with Indian grouping and exact paise", () => {
    expect(formatPaise(15000050)).toBe("₹1,50,000.50");
    expect(formatPaise(100)).toBe("₹1.00");
    expect(formatPaise(5)).toBe("₹0.05");
    expect(formatPaise(-250000)).toBe("-₹2,500.00");
    expect(formatPaise(1_00_00_000_00, { decimals: false })).toBe("₹1,00,00,000");
    expect(formatRupees(2500000)).toBe("₹25,00,000");
  });
});

describe("EMI", () => {
  it("matches a well-known value: 1,00,000 at 12% for 12 months is 8,884.88", () => {
    expect(computeEmi(10_000_000n, 1200, 12)).toBe(888_488n);
  });
  it("handles a zero rate by splitting the principal", () => {
    expect(computeEmi(12_000_000n, 0, 12)).toBe(1_000_000n);
    expect(computeEmi(100n, 0, 3)).toBe(33n);
  });
  it("agrees with a floating-point reference to within one paisa across a grid", () => {
    for (const principal of [5_000, 49_999, 250_000, 1_234_567, 5_000_000]) {
      for (const bps of [100, 750, 1200, 1600, 2400]) {
        for (const n of [3, 6, 12, 24, 60, 120]) {
          const r = bps / 120_000;
          const ref = (principal * r * (1 + r) ** n) / ((1 + r) ** n - 1);
          const got = Number(computeEmi(toPaise(principal), bps, n)) / 100;
          expect(Math.abs(got - ref), `${principal} ${bps} ${n}`).toBeLessThanOrEqual(0.011);
        }
      }
    }
  });
  it("rejects impossible inputs", () => {
    expect(() => computeEmi(0n, 1200, 12)).toThrow(RangeError);
    expect(() => computeEmi(1000n, 1200, 0)).toThrow(RangeError);
    expect(() => computeEmi(1000n, 1200, 121)).toThrow(RangeError);
    expect(() => computeEmi(1000n, -1, 12)).toThrow(RangeError);
    expect(() => computeEmi(1000n, 1200, 1.5)).toThrow(RangeError);
  });
});

describe("final calculation", () => {
  const input = { assetPriceRupees: 20_000, addOnsRupees: 1_499, downPaymentBps: 1000, annualRateBps: 1600, tenureMonths: 12, processingFeeBps: 200, minProcessingFeeRupees: 0, gstBps: 1800 };
  const r = calculateFinal(input);

  it("itemises exactly", () => {
    expect(r.assetPricePaise).toBe(2_000_000);
    expect(r.addOnsPaise).toBe(149_900);
    expect(r.downPaymentPaise).toBe(200_000);
    expect(r.financedAmountPaise).toBe(1_949_900); // 20,000 + 1,499 - 2,000
  });
  it("is internally consistent to the paisa", () => {
    expect(r.totalEmiPaise).toBe(r.emiPaise * 12);
    expect(r.totalInterestPaise).toBe(r.totalEmiPaise - r.financedAmountPaise);
    expect(r.totalFeesPaise).toBe(r.processingFeePaise + r.taxOnFeesPaise);
    expect(r.processingFeePaise).toBe(Math.round(r.financedAmountPaise * 0.02));
    expect(r.taxOnFeesPaise).toBe(Math.round(r.processingFeePaise * 0.18));
    expect(r.totalPayablePaise).toBe(r.totalEmiPaise + r.totalFeesPaise);
    expect(r.totalCostPaise).toBe(r.downPaymentPaise + r.totalPayablePaise);
  });
  it("applies a minimum processing fee", () => {
    expect(calculateFinal({ ...input, processingFeeBps: 0, minProcessingFeeRupees: 99 }).processingFeePaise).toBe(9900);
  });
  it("never reports negative interest", () => {
    expect(calculateFinal({ ...input, annualRateBps: 0 }).totalInterestPaise).toBeGreaterThanOrEqual(0);
  });
  it("rejects missing or impossible inputs instead of guessing", () => {
    expect(() => calculateFinal({ ...input, assetPriceRupees: 0 })).toThrow(RangeError);
    expect(() => calculateFinal({ ...input, downPaymentBps: 10_000, addOnsRupees: 0 })).toThrow(RangeError);
    expect(() => calculateFinal({ ...input, tenureMonths: 0 })).toThrow(RangeError);
  });
  it("builds offer-style terms for a plain principal", () => {
    const t = calculateIndicative(50_000, { annualRateBps: 1600, tenureMonths: 12, processingFeeBps: 200, minProcessingFeeRupees: 0, gstBps: 1800 });
    expect(t.principalPaise).toBe(5_000_000);
    expect(t.processingFeePaise).toBe(100_000);
    expect(t.taxOnFeesPaise).toBe(18_000);
    expect(t.totalPayablePaise).toBe(t.emiPaise * 12 + 118_000);
  });
});
