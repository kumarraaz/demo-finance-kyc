// Money is calculated in integer paise using BigInt, never with binary floating point.
// Values that are stored or displayed are converted to plain numbers of paise (safe up to about 9e13 rupees).

export type Paise = bigint;

export function toPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees)) throw new RangeError("Amount must be a finite number");
  const p = Math.round(rupees * 100);
  if (!Number.isSafeInteger(p)) throw new RangeError("Amount is too large");
  return BigInt(p);
}

export function paiseToNumber(p: Paise): number {
  const n = Number(p);
  if (!Number.isSafeInteger(n)) throw new RangeError("Amount is too large");
  return n;
}

/** Basis-point share of an amount, rounded half up. 1800 bps of 10000 paise = 1800 paise. */
export function mulBps(p: Paise, bps: number): Paise {
  return (p * BigInt(bps) + 5000n) / 10000n;
}

/** Divide with rounding half up (non-negative operands). */
export function divRound(n: bigint, d: bigint): bigint {
  return (n * 2n + d) / (d * 2n);
}

const groupInt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** 15000050 paise -> "₹1,50,000.50". Exact for any safe integer. */
export function formatPaise(paise: number | bigint, opts: { decimals?: boolean } = {}): string {
  const p = BigInt(paise);
  const neg = p < 0n;
  const abs = neg ? -p : p;
  const rupees = groupInt.format(abs / 100n);
  const frac = (abs % 100n).toString().padStart(2, "0");
  const showFrac = opts.decimals ?? true;
  return `${neg ? "-" : ""}₹${rupees}${showFrac ? `.${frac}` : ""}`;
}

/** Whole-rupee amounts typed by users. */
export function formatRupees(rupees: number): string {
  return formatPaise(toPaise(rupees), { decimals: false });
}
