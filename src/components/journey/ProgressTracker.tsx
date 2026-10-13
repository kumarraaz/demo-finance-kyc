"use client";

import Link from "next/link";
import { isPassed, isStepAvailable, progressPercent, STEPS, stepDef, type JourneyState } from "@/lib/journey/machine";
import { STEP_IDS, type StepId } from "@/lib/journey/types";
import { Icon, type IconName } from "@/components/Icon";
import { StepStatusPill, STEP_STATUS_LABEL } from "./StatusPill";

export const STEP_ICONS: Record<StepId, IconName> = {
  basic: "user", kyc: "idCard", demographics: "list", liveness: "camera", offer: "tag", asset: "box", addons: "plus", calculation: "calculator",
};

type Props = { journey: JourneyState; current: StepId | null; go: (href: string) => void };

function StepList({ journey, current, go }: Props) {
  return (
    <ol className="cj-steplist">
      {STEPS.map((s, i) => {
        const state = journey[s.id];
        const open = isStepAvailable(s.id, journey);
        const body = (
          <>
            <span className={`cj-stepicon cj-stepicon-${state.status}`} aria-hidden="true">
              {isPassed(state.status) ? <Icon name={state.status === "review_required" ? "alert" : "checkCircle"} size={18} /> : <Icon name={STEP_ICONS[s.id]} size={18} />}
            </span>
            <span className="cj-steptext">
              <span className="cj-stepname">{i + 1}. {s.label}</span>
              <StepStatusPill status={state.status} />
            </span>
          </>
        );
        return (
          <li key={s.id} className={s.id === current ? "is-current" : undefined}>
            {open ? (
              <Link href={s.path} className="cj-steplink" aria-current={s.id === current ? "step" : undefined} onClick={(e) => { e.preventDefault(); go(s.path); }}>
                {body}
              </Link>
            ) : (
              <span className="cj-steplink is-locked" aria-disabled="true" title="Finish the earlier steps first">
                {body}
                <span className="sr-only">Locked until earlier steps are finished</span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Compact progress (always shown, sits at the top of the page column): step label, segmented bar, expandable list on phones. */
export function ProgressSummary({ journey, current, go }: Props) {
  const pct = progressPercent(journey);
  const index = current ? STEP_IDS.indexOf(current) + 1 : 0;
  const label = current ? `Step ${index} of ${STEP_IDS.length}: ${stepDef(current).label}` : `${STEP_IDS.length} steps`;
  return (
    <section className="cj-tracker" aria-label="Application progress">
      <div className="cj-tracker-head">
        <strong>{label}</strong>
        <span className="cj-muted">{pct}% passed</span>
      </div>
      <div className="cj-segbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Steps passed">
        {STEP_IDS.map((id) => (
          <span key={id} className={`cj-seg cj-seg-${journey[id].status}${id === current ? " is-current" : ""}`} title={`${stepDef(id).label}: ${STEP_STATUS_LABEL[journey[id].status]}`} />
        ))}
      </div>
      <details className="cj-tracker-more">
        <summary>View all steps</summary>
        <StepList journey={journey} current={current} go={go} />
      </details>
    </section>
  );
}

/** Full vertical step list: the first grid column on wide screens (hidden below 1024px, where the summary's list is used). */
export function ProgressSide({ journey, current, go }: Props) {
  return (
    <aside className="cj-side" aria-label="All steps">
      <h2 className="cj-side-title">Your application</h2>
      <StepList journey={journey} current={current} go={go} />
    </aside>
  );
}
