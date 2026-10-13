"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { stepDef } from "@/lib/journey/machine";
import { STEP_IDS, type StepId } from "@/lib/journey/types";
import { ActionBar, type ActionButton } from "./ActionBar";
import { ConfirmDialog } from "./ConfirmDialog";
import { CustomerHeader } from "./CustomerHeader";
import { ProgressSide, ProgressSummary } from "./ProgressTracker";
import { useJourney } from "./JourneyProvider";

export type StepFrameProps = {
  /** Which journey step this screen belongs to (null for screens outside the 8 steps). */
  step: StepId | null;
  title: string;
  subtitle?: string;
  children: ReactNode;
  back?: ActionButton;
  secondary?: ActionButton;
  primary?: ActionButton;
  /** Extra label for the action bar, e.g. "Step 1/3". Defaults to "Step n of 8". */
  stepLabel?: string;
  note?: ReactNode;
  /** Unsaved changes: prompts before leaving through the header or the step list, and before closing the tab. */
  dirty?: boolean;
  onSaveBeforeLeave?: () => Promise<void>;
  /** Hide the "Application reference" line (the completion screen shows it its own way). */
  hideRef?: boolean;
};

export function StepFrame({ step, title, subtitle, children, back, secondary, primary, stepLabel, note, dirty, onSaveBeforeLeave, hideRef }: StepFrameProps) {
  const router = useRouter();
  const { draft, journey } = useJourney();
  const [pending, setPending] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const go = (href: string) => {
    if (dirty) setPending(href);
    else router.push(href);
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const label = stepLabel ?? (step ? `Step ${STEP_IDS.indexOf(step) + 1} of ${STEP_IDS.length}: ${stepDef(step).label}` : undefined);

  return (
    <div className="cj">
      <CustomerHeader draft={draft} go={go} />
      <div className="cj-shell">
        {journey && <ProgressSide journey={journey} current={step} go={go} />}
        <main id="main" className="cj-main" tabIndex={-1}>
          {journey && <ProgressSummary journey={journey} current={step} go={go} />}
          <div className="cj-pagehead">
            <h1>{title}</h1>
            {subtitle && <p className="cj-sub">{subtitle}</p>}
            {draft && !hideRef && (
              <p className="cj-refline">
                Application reference: <strong>{draft.reference}</strong>
              </p>
            )}
          </div>
          {children}
          <ActionBar back={back} secondary={secondary} primary={primary} stepLabel={label} note={note} />
        </main>
      </div>

      <ConfirmDialog
        open={pending !== null}
        title="You have unsaved changes"
        onClose={() => setPending(null)}
        actions={
          <>
            <button type="button" className="cj-btn cj-btn-ghost" onClick={() => setPending(null)}>Keep editing</button>
            <button type="button" className="cj-btn cj-btn-secondary" onClick={() => { const to = pending!; setPending(null); router.push(to); }}>Discard changes</button>
            {onSaveBeforeLeave && (
              <button
                type="button"
                className="cj-btn cj-btn-primary"
                disabled={saving}
                onClick={async () => {
                  const to = pending!;
                  setSaving(true);
                  try {
                    await onSaveBeforeLeave();
                    setPending(null);
                    router.push(to);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Save and leave
              </button>
            )}
          </>
        }
      >
        <p>Leaving this page now would lose what you changed since you last saved.</p>
      </ConfirmDialog>
    </div>
  );
}
