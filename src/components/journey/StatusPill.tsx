import type { KycStatus, OfferStatus, StepStatus, VerificationStatus } from "@/lib/journey/types";

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  review_required: "Review Required",
  failed: "Failed",
};

export function StepStatusPill({ status }: { status: StepStatus }) {
  return <span className={`cj-pill cj-pill-${status}`}>{STEP_STATUS_LABEL[status]}</span>;
}

const VERIFICATION_LABEL: Record<VerificationStatus, { text: string; tone: string }> = {
  not_started: { text: "Not Started", tone: "pending" },
  pending: { text: "Pending", tone: "in_progress" },
  demo_verified: { text: "Demo Verified", tone: "completed" },
  failed: { text: "Failed", tone: "failed" },
  integration_required: { text: "Integration Required", tone: "review_required" },
};

/** PAN / mobile status. "Demo Verified" always says Demo, so it can never read as a real verification. */
export function VerificationPill({ status, label }: { status: VerificationStatus; label?: string }) {
  const v = VERIFICATION_LABEL[status];
  return (
    <span className={`cj-pill cj-pill-${v.tone}`}>
      {label ? `${label}: ` : ""}
      {v.text}
    </span>
  );
}

const KYC_LABEL: Record<KycStatus, { text: string; tone: string }> = {
  not_started: { text: "Not Started", tone: "pending" },
  consent_required: { text: "Consent Required", tone: "review_required" },
  request_pending: { text: "Request Pending", tone: "in_progress" },
  demo_otp_issued: { text: "Demo OTP Issued", tone: "in_progress" },
  demo_verified: { text: "Demo Verified", tone: "completed" },
  cancelled: { text: "Cancelled", tone: "pending" },
  failed: { text: "Failed", tone: "failed" },
  integration_required: { text: "Integration Required", tone: "review_required" },
};

export function kycDisplayStatus(status: KycStatus, consent: boolean): KycStatus {
  if (!consent && (status === "not_started" || status === "cancelled")) return status === "cancelled" ? "cancelled" : "consent_required";
  return status;
}

export function KycPill({ status }: { status: KycStatus }) {
  const v = KYC_LABEL[status];
  return <span className={`cj-pill cj-pill-${v.tone}`}>{v.text}</span>;
}

const OFFER_LABEL: Record<OfferStatus, string> = {
  not_requested: "Not requested",
  eligible: "Indicative offer (demo)",
  review_required: "Review required",
  not_eligible: "Not eligible (demo)",
  integration_required: "Integration unavailable",
};
export const offerStatusLabel = (s: OfferStatus) => OFFER_LABEL[s];

/** Small tag put next to any figure or result that comes from a demo fixture. */
export function DemoTag({ children = "DEMO" }: { children?: string }) {
  return <span className="cj-demo-tag">{children}</span>;
}
