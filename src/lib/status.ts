// Status model for demo applications. Wording is deliberately neutral:
// there is no "approved" or "rejected" because no real decision is ever made.
export const STATUSES = [
  "submitted",
  "in_review",
  "more_info_needed",
  "simulated_check_passed",
  "simulated_check_failed",
  "closed",
] as const;

export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  submitted: "Submitted",
  in_review: "In review",
  more_info_needed: "More info needed",
  simulated_check_passed: "Simulated check passed (demo)",
  simulated_check_failed: "Simulated check failed (demo)",
  closed: "Closed",
};

export const TRANSITIONS: Record<Status, readonly Status[]> = {
  submitted: ["in_review", "closed"],
  in_review: ["more_info_needed", "simulated_check_passed", "simulated_check_failed", "closed"],
  more_info_needed: ["in_review", "closed"],
  simulated_check_passed: ["closed"],
  simulated_check_failed: ["in_review", "closed"],
  closed: [],
};

// A note is mandatory when the move needs an explanation on the audit trail.
export const NOTE_REQUIRED: readonly Status[] = ["more_info_needed", "simulated_check_failed", "closed"];

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isSimulatedStatus(status: Status): boolean {
  return status === "simulated_check_passed" || status === "simulated_check_failed";
}
