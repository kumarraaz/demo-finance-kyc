import type { BasicDetails, VerificationStatus } from "./types";

// Simulated mobile and PAN checks. No SMS is sent and no PAN authority is contacted. The outcome is a fixed rule so the
// "Failed" state can be exercised: a PAN whose LAST letter is X fails the demo check. Everything else passes.
export const DEMO_PAN_FAIL_LETTER = "X";

export function simulateBasicVerification(b: Pick<BasicDetails, "mobile" | "panMasked">): { mobile: VerificationStatus; pan: VerificationStatus } {
  const panFails = b.panMasked.trim().toUpperCase().endsWith(DEMO_PAN_FAIL_LETTER);
  return { mobile: "demo_verified", pan: panFails ? "failed" : "demo_verified" };
}

/** Verification belongs to the exact values that were checked, so changing any of them invalidates it. */
export function basicIdentityChanged(before: BasicDetails, after: Pick<BasicDetails, "mobile" | "dob" | "panName" | "panMasked">): boolean {
  return before.mobile !== after.mobile || before.dob !== after.dob || before.panName !== after.panName || before.panMasked !== after.panMasked;
}
