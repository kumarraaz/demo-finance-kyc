import type { OverallStatus } from "@/lib/journey/machine";

const LABEL: Record<OverallStatus, { text: string; tone: string }> = {
  not_started: { text: "Not started", tone: "pending" },
  in_progress: { text: "In progress", tone: "in_progress" },
  review_required: { text: "Review required", tone: "review_required" },
  failed: { text: "Needs attention", tone: "failed" },
  completed: { text: "Demo journey completed", tone: "completed" },
};

export function OverallPill({ status }: { status: OverallStatus }) {
  const v = LABEL[status];
  return <span className={`cj-pill cj-pill-${v.tone}`}>{v.text}</span>;
}
