"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { isStepAvailable, markVisited } from "@/lib/journey/machine";
import type { JourneyDraft, StepId } from "@/lib/journey/types";
import { CjBrand } from "./CjBrand";
import { useJourney } from "./JourneyProvider";

/**
 * Wraps a step screen. It waits for the saved draft, sends people without one to the start, keeps people out of a step
 * whose earlier steps are not finished (and says why on the journey page), and records that the screen was opened.
 * An optional `requires` check protects sub-screens (for example "liveness capture needs consent").
 */
export function StepGate({
  step, children, requires, redirectTo = "/apply/journey",
}: {
  step: StepId; children: (draft: JourneyDraft) => ReactNode; requires?: (d: JourneyDraft) => boolean; redirectTo?: string;
}) {
  const router = useRouter();
  const { ready, draft, journey, update } = useJourney();
  const blockedByOrder = Boolean(journey && !isStepAvailable(step, journey));
  const blockedBySub = Boolean(draft && requires && !requires(draft));

  useEffect(() => {
    if (!ready) return;
    if (!draft) router.replace("/apply");
    else if (blockedByOrder) router.replace(`/apply/journey?locked=${step}`);
    else if (blockedBySub) router.replace(redirectTo);
  }, [ready, draft, blockedByOrder, blockedBySub, router, step, redirectTo]);

  useEffect(() => {
    if (ready && draft && !blockedByOrder && !blockedBySub && !draft.visited[step]) void update((d) => markVisited(d, step));
  }, [ready, draft, blockedByOrder, blockedBySub, step, update]);

  if (!ready || !draft || blockedByOrder || blockedBySub) {
    return (
      <div className="cj" aria-busy="true">
        <header className="cj-header"><div className="cj-header-inner"><CjBrand /></div></header>
        <main id="main" className="cj-main cj-loading" tabIndex={-1}>
          <p role="status">Loading your application…</p>
          <div className="skeleton skel-title" />
          <div className="skeleton skel-block" />
        </main>
      </div>
    );
  }
  return <>{children(draft)}</>;
}
