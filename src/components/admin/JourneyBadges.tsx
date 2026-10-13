import type { OverallStatus } from "@/lib/journey/machine";
import { STEPS } from "@/lib/journey/machine";
import { STEP_IDS, type StepId, type StepStatus } from "@/lib/journey/types";

export const STEP_STATUS_TEXT: Record<StepStatus, string> = { pending: "Pending", in_progress: "In Progress", completed: "Completed", review_required: "Review Required", failed: "Failed" };
export const OVERALL_TEXT: Record<OverallStatus, string> = { not_started: "Not started", in_progress: "In progress", review_required: "Review required", failed: "Needs attention", completed: "Demo journey completed" };

export function StepBadge({ status }: { status: StepStatus }) {
  return <span className={`jbadge jbadge-${status}`}>{STEP_STATUS_TEXT[status]}</span>;
}
export function OverallBadge({ status }: { status: OverallStatus }) {
  return <span className={`jbadge jbadge-${status}`}>{OVERALL_TEXT[status]}</span>;
}

/** Eight small squares, one per step, with the full text available to screen readers. */
export function StepStrip({ steps }: { steps: Record<StepId, StepStatus> }) {
  return (
    <ul className="jsteps" aria-label="Step statuses">
      {STEP_IDS.map((id) => {
        const label = `${STEPS.find((s) => s.id === id)!.label}: ${STEP_STATUS_TEXT[steps[id]]}`;
        return (
          <li key={id} className={`jstep jstep-${steps[id]}`} title={label}>
            <span className="sr-only">{label}</span>
          </li>
        );
      })}
    </ul>
  );
}
