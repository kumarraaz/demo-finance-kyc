// Integration contracts. Phase 1 ships DEMO adapters for every one of these (providers/demo-*.ts).
// A real provider implements the same interface and is swapped in providers/index.ts; the screens do not change.
import type { AssetDetail } from "../catalog";
import type { DemoScheme, SchemeContext, SchemeEligibility } from "../schemes";
import type { IndicativeOffer, JourneyDraft, KycStatus } from "../types";

/** Every adapter says whether it is a demo or a live integration, so screens and the admin view can say so. */
export type ProviderMeta = { id: string; name: string; mode: "demo" | "live" };

export type KycRequest = { reference: string; consent: true };
export type KycRequestResult = { status: Extract<KycStatus, "demo_otp_issued" | "failed" | "integration_required">; requestedAt: string; resendAvailableAt: string };
export type KycVerifyResult = {
  status: Extract<KycStatus, "demo_verified" | "demo_otp_issued" | "failed">;
  attemptsLeft: number;
  verifiedAt?: string;
  /** A placeholder line only. No identity document content passes through this interface in Phase 1. */
  documentSummary?: string;
};
export interface KycProvider {
  readonly meta: ProviderMeta;
  requestVerification(input: KycRequest): Promise<KycRequestResult>;
  /**
   * The OTP is used for this call only and must never be stored or logged.
   * `resumeAttemptsLeft` lets the stateless demo adapter continue a request made before a page reload; a real provider
   * keeps that state itself and ignores it.
   */
  verifyOtp(input: { reference: string; otp: string; resumeAttemptsLeft?: number }): Promise<KycVerifyResult>;
  getVerificationStatus(reference: string): Promise<{ status: KycStatus }>;
}

export type LivenessSession = { sessionId: string; mode: "demo" };
export type LivenessCaptureInput = { sessionId: string; source: "camera" | "placeholder" };
export type LivenessResult = { outcome: "demo_passed" | "demo_review" | "demo_failed"; demoScorePct: number; completedAt: string };
export interface LivenessProvider {
  readonly meta: ProviderMeta;
  startSession(reference: string): Promise<LivenessSession>;
  /** Phase 1 never sends image data; a live adapter would receive the capture here after explicit consent. */
  submitCapture(input: LivenessCaptureInput): Promise<void>;
  getResult(sessionId: string): Promise<LivenessResult>;
}

export type OfferRequest = { requestedAmountRupees: number; monthlyIncomeRupees: number };
export type OfferResult = IndicativeOffer | { status: "integration_required"; reasons: string[]; source: string };
export interface OfferProvider {
  readonly meta: ProviderMeta;
  getIndicativeOffer(input: OfferRequest): Promise<OfferResult>;
}

export interface ProductCatalogProvider {
  readonly meta: ProviderMeta;
  getProductTypes(): Promise<{ id: string; label: string }[]>;
  getManufacturers(productType: string): Promise<{ id: string; label: string }[]>;
  getModels(productType: string, manufacturer: string): Promise<{ id: string; label: string }[]>;
  getVariants(productType: string, manufacturer: string, model: string): Promise<{ id: string; label: string; pricePaise: number }[]>;
  getAssetDetail(sel: { productType: string; manufacturer: string; model: string; variant: string }): Promise<AssetDetail | null>;
}

export interface SchemeProvider {
  readonly meta: ProviderMeta;
  getAvailableSchemes(ctx: SchemeContext): Promise<{ scheme: DemoScheme; eligibility: SchemeEligibility }[]>;
}

export type ApplicationStatusSummary = { reference: string; currentStep: string; updatedAt: string };

export interface ApplicationRepository {
  readonly meta: ProviderMeta;
  saveDraft(draft: JourneyDraft): Promise<void>;
  loadApplication(reference: string): Promise<JourneyDraft | null>;
  getApplicationStatus(reference: string): Promise<ApplicationStatusSummary | null>;
  /** Convenience for the browser demo: the draft this browser is working on, and the whole local list. */
  getCurrentReference(): Promise<string | null>;
  setCurrentReference(reference: string | null): Promise<void>;
  listDrafts(): Promise<JourneyDraft[]>;
  deleteDraft(reference: string): Promise<void>;
  clearAll(): Promise<void>;
}
