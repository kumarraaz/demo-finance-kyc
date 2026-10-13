import { DEFAULT_RULES, type JourneyRules } from "../rules";
import type { KycProvider } from "./types";

/**
 * DEMO KYC adapter. It sends no SMS, calls no document service and retrieves no identity data.
 * The "OTP" is a fixed, publicly documented demo code so the screen can be exercised; it is not a secret.
 * Attempts are counted in memory for this page session only.
 */
export function createDemoKycProvider(rules: JourneyRules = DEFAULT_RULES, now: () => Date = () => new Date()): KycProvider {
  const attempts = new Map<string, number>();
  const issued = new Set<string>();
  return {
    meta: { id: "kyc-demo", name: "Demo document retrieval (not DigiLocker)", mode: "demo" },
    async requestVerification({ reference }) {
      attempts.set(reference, rules.otp.maxAttempts);
      issued.add(reference);
      const t = now();
      return {
        status: "demo_otp_issued",
        requestedAt: t.toISOString(),
        resendAvailableAt: new Date(t.getTime() + rules.otp.resendSeconds * 1000).toISOString(),
      };
    },
    async verifyOtp({ reference, otp, resumeAttemptsLeft }) {
      if (!issued.has(reference)) {
        // After a page reload this adapter has forgotten the request; the saved draft says one is open.
        if (resumeAttemptsLeft === undefined || resumeAttemptsLeft <= 0) return { status: "failed", attemptsLeft: 0 };
        issued.add(reference);
        attempts.set(reference, resumeAttemptsLeft);
      }
      const left = attempts.get(reference) ?? rules.otp.maxAttempts;
      if (otp === rules.otp.demoCode) {
        issued.delete(reference);
        return {
          status: "demo_verified",
          attemptsLeft: left,
          verifiedAt: now().toISOString(),
          documentSummary: "Placeholder only. No identity document was retrieved in the demo.",
        };
      }
      const remaining = left - 1;
      attempts.set(reference, remaining);
      if (remaining <= 0) {
        issued.delete(reference);
        return { status: "failed", attemptsLeft: 0 };
      }
      return { status: "demo_otp_issued", attemptsLeft: remaining };
    },
    async getVerificationStatus(reference) {
      return { status: issued.has(reference) ? "demo_otp_issued" : "not_started" };
    },
  };
}
