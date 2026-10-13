import { VerificationPill } from "./StatusPill";
import type { JourneyDraft } from "@/lib/journey/types";

/** Shown on all three demographic screens: reference, "Step n/3" and the PAN status badge. */
export function DemographicsHeader({ draft, step }: { draft: JourneyDraft; step: 1 | 2 | 3 }) {
  return (
    <div className="cj-card cj-compact" aria-label="Application summary">
      <div className="cj-badges">
        <span className="cj-pill cj-pill-in_progress">Step {step}/3</span>
        <VerificationPill status={draft.basic.panStatus} label="PAN" />
      </div>
      <dl className="cj-kv">
        <div><dt>Application reference</dt><dd>{draft.reference}</dd></div>
        {draft.basic.panMasked && <div><dt>PAN (masked)</dt><dd>{draft.basic.panMasked}</dd></div>}
      </dl>
    </div>
  );
}
