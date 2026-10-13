"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Icon } from "@/components/Icon";
import { useJourney } from "@/components/journey/JourneyProvider";
import { Notice, DemoNotice } from "@/components/journey/Notices";
import { OverallPill } from "@/components/journey/OverallPill";
import { STEP_ICONS } from "@/components/journey/ProgressTracker";
import { StepFrame } from "@/components/journey/StepFrame";
import { StepStatusPill } from "@/components/journey/StatusPill";
import { DEMOGRAPHIC_SUBSTEPS, isStepAvailable, nextStep, overallStatus, STEPS, stepDef } from "@/lib/journey/machine";
import { STEP_IDS, type StepId } from "@/lib/journey/types";

function JourneyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { ready, draft, journey } = useJourney();
  const locked = params.get("locked");
  const lockedStep = STEP_IDS.includes(locked as StepId) ? (locked as StepId) : null;

  useEffect(() => {
    if (ready && !draft) router.replace("/apply");
  }, [ready, draft, router]);

  if (!ready || !draft || !journey) {
    return (
      <div className="cj"><main id="main" className="cj-main cj-loading" tabIndex={-1}><p role="status">Loading your application…</p><div className="skeleton skel-block" /></main></div>
    );
  }

  const next = nextStep(journey);
  const overall = overallStatus(journey, draft);
  const nextPath = next === "done" ? "/apply/complete" : stepDef(next).path;

  return (
    <StepFrame
      step={null}
      title="Application journey"
      subtitle="Each step becomes Completed only when its required details are saved and valid. Open any finished step to review or edit it."
      stepLabel="Application journey"
      back={{ label: "Back", href: "/apply" }}
      primary={{ label: next === "done" ? "View completion" : "Proceed", href: nextPath, icon: <Icon name="arrowRight" size={18} /> }}
      note={next === "done" ? "All steps passed" : `Next: ${stepDef(next).label}`}
    >
      {lockedStep && (
        <Notice tone="warn" title={`${stepDef(lockedStep).label} is not open yet`}>
          Finish the earlier steps first. The next available step is highlighted below.
        </Notice>
      )}
      <div className="cj-badges"><OverallPill status={overall} /><span className="cj-muted small">Overall status</span></div>
      <DemoNotice />

      <ol className="cj-journey" aria-label="Journey steps">
        {STEPS.map((s, i) => {
          const state = journey[s.id];
          const open = isStepAvailable(s.id, journey);
          const isNext = next === s.id;
          return (
            <li key={s.id}>
              <div className={`cj-journey-row${open ? "" : " is-locked"}`}>
                <span className={`cj-stepicon cj-stepicon-${state.status}`} aria-hidden="true"><Icon name={STEP_ICONS[s.id]} size={20} /></span>
                <div>
                  <span className="cj-journey-title">{i + 1}. {s.label}</span>
                  <span className="cj-journey-desc">{s.description}</span>
                  <span className="cj-journey-meta">
                    <StepStatusPill status={state.status} />
                    {!open && <span className="cj-muted small"><Icon name="lock" size={14} /> Locked until earlier steps pass</span>}
                  </span>
                  {state.reasons.length > 0 && <span className="cj-journey-note">{state.reasons[0]}</span>}
                  {isNext && <div className="cj-journey-proceed"><Link href={s.path} className="cj-btn cj-btn-primary">Proceed</Link></div>}
                </div>
                <div className="cj-actions">
                  {open ? (
                    <Link href={s.path} className="cj-iconbtn-dark" aria-label={`Open ${s.label}`}><Icon name="chevronRight" size={22} /></Link>
                  ) : (
                    <span className="cj-iconbtn-dark is-disabled" aria-hidden="true"><Icon name="lock" size={18} /></span>
                  )}
                </div>
              </div>
              {s.id === "demographics" && (
                <ul className="cj-sublist" aria-label="Demographic sub-steps">
                  {DEMOGRAPHIC_SUBSTEPS.map((sub, k) => (
                    <li key={sub.id}>
                      <Icon name={journey.demographicSubsteps[sub.id].complete ? "checkCircle" : "clock"} size={16} />
                      {open ? <Link href={sub.path}>Step {k + 1}/3: {sub.label}</Link> : <span>Step {k + 1}/3: {sub.label}</span>}
                      <span className="cj-muted small">{journey.demographicSubsteps[sub.id].complete ? "saved" : "incomplete"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </StepFrame>
  );
}

export default function JourneyPage() {
  return (
    <Suspense fallback={<div className="cj"><main id="main" className="cj-main cj-loading" tabIndex={-1}><p role="status">Loading…</p></main></div>}>
      <JourneyInner />
    </Suspense>
  );
}
