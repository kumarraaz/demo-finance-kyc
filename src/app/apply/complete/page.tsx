"use client";

import { Icon } from "@/components/Icon";
import { CompletionSummary } from "@/components/journey/CompletionSummary";
import { useJourney } from "@/components/journey/JourneyProvider";
import { DemoNotice } from "@/components/journey/Notices";
import { StepFrame } from "@/components/journey/StepFrame";
import { StepGate } from "@/components/journey/StepGate";
import { formatDateTime } from "@/lib/format";

export default function CompletePage() {
  // Only reachable after the final calculation was confirmed; anything else goes back to the journey.
  return <StepGate step="calculation" requires={(d) => Boolean(d.calculation.confirmedAt)}>{() => <Complete />}</StepGate>;
}

function Complete() {
  const { draft, journey } = useJourney();
  if (!draft || !journey) return null;
  return (
    <StepFrame
      step={null}
      title="Demo Journey Completed"
      stepLabel="Application complete (demo)"
      hideRef
      back={{ label: "View application summary", href: "/apply/journey" }}
      primary={{ label: "Return to dashboard", href: "/apply", icon: <Icon name="home" size={18} /> }}
    >
      <section className="cj-card cj-done" aria-labelledby="done-title">
        <span className="cj-done-icon" aria-hidden="true"><Icon name="checkCircle" size={34} /></span>
        <h2 id="done-title">You have completed the demo journey</h2>
        <p className="cj-muted">Application reference</p>
        <p className="cj-bignum">{draft.reference}</p>
        {draft.completedAt && <p className="cj-muted small">Completed {formatDateTime(draft.completedAt)}</p>}
      </section>
      <DemoNotice>
        This is a demonstration. <strong>No loan has been approved, sanctioned or disbursed</strong>, and no real verification took place. Everything below is simulated or illustrative.
      </DemoNotice>
      <CompletionSummary draft={draft} journey={journey} />
    </StepFrame>
  );
}
