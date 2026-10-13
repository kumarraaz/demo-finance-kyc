"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useJourney } from "@/components/journey/JourneyProvider";
import { SilhouettePlaceholder } from "@/components/journey/LivenessIllustration";
import { DemoNotice, Notice } from "@/components/journey/Notices";
import { StepStatusPill } from "@/components/journey/StatusPill";
import { StepFrame } from "@/components/journey/StepFrame";
import { StepGate } from "@/components/journey/StepGate";
import { clearSession, getImageUrl, openCameraScreen } from "@/lib/journey/liveness-session";

export default function LivenessResultPage() {
  return <StepGate step="liveness" requires={(d) => d.liveness.consent && d.liveness.captured} redirectTo="/apply/liveness">{() => <Result />}</StepGate>;
}

const OUTCOME = {
  demo_passed: { text: "Liveness: demo passed", tone: "completed" },
  demo_review: { text: "Liveness: review required (demo)", tone: "review_required" },
  demo_failed: { text: "Liveness: demo failed", tone: "failed" },
} as const;

function Result() {
  const router = useRouter();
  const { draft, journey, update, providers } = useJourney();
  const lv = draft!.liveness;
  const [photo] = useState<string | null>(() => getImageUrl());
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const processing = !lv.result && !error;

  // Run the (simulated) provider once per capture. No image data is passed to it.
  useEffect(() => {
    if (lv.result) return;
    let live = true;
    (async () => {
      try {
        const session = await providers.liveness.startSession(draft!.reference);
        await providers.liveness.submitCapture({ sessionId: session.sessionId, source: lv.source === "camera" ? "camera" : "placeholder" });
        await new Promise((r) => setTimeout(r, 1100)); // visible "processing" state
        const result = await providers.liveness.getResult(session.sessionId);
        if (live) await update((d) => ({ ...d, liveness: { ...d.liveness, result } }));
      } catch {
        if (live) setError("The simulated check could not be completed. Try again.");
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lv.result, attempt]);

  const outcome = lv.result ? OUTCOME[lv.result.outcome] : null;
  const passed = journey ? journey.liveness.status === "completed" || journey.liveness.status === "review_required" : false;

  return (
    <StepFrame
      step="liveness"
      title="Liveness Result"
      subtitle="This result is simulated for the demo."
      stepLabel="Liveness Check: result"
      back={{ label: "Back", onClick: () => openCameraScreen(false) }}
      secondary={{ label: "Retake photo", onClick: () => { clearSession(); openCameraScreen(true); } }}
      primary={{ label: "Proceed", onClick: () => { clearSession(); router.push("/apply/offer"); }, disabled: !passed }}
      note={processing ? "Processing…" : !passed && lv.result ? "Retake to try again" : undefined}
    >
      <DemoNotice>
        No face is compared in this demo. The score below is a <strong>fixed demo value</strong>, not calculated from your photo, and it does not show that you
        are who you say you are.
      </DemoNotice>

      <section className="cj-card" aria-labelledby="photos-title">
        <h2 id="photos-title">Photos</h2>
        <div className="cj-photos">
          <figure className="cj-photo">
            <div className="cj-photo-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {photo ? <img src={photo} alt="Your captured photo (kept in memory only)" /> : <SilhouettePlaceholder />}
            </div>
            <figcaption>{photo ? "Your photo (not stored)" : lv.source === "placeholder" ? "Simulated: no photo taken" : "Photo not kept after a reload"}</figcaption>
          </figure>
          <figure className="cj-photo">
            <div className="cj-photo-frame"><SilhouettePlaceholder /></div>
            <figcaption>Reference image (generic placeholder)</figcaption>
          </figure>
        </div>
      </section>

      <section className="cj-card" aria-labelledby="status-title" aria-live="polite">
        <h2 id="status-title">Status <span className="cj-demo-tag">DEMO</span></h2>
        {processing && (
          <div className="cj-badges" role="status"><span className="spinner" aria-hidden="true" /><span>Processing the simulated check…</span></div>
        )}
        {error && (
          <>
            <Notice tone="error">{error}</Notice>
            <div><button type="button" className="cj-btn cj-btn-secondary" onClick={() => { setError(""); setAttempt((a) => a + 1); }}><Icon name="refresh" size={18} />Try again</button></div>
          </>
        )}
        {lv.result && outcome && (
          <>
            <dl className="cj-kv">
              <div><dt>Processing status</dt><dd>Completed (simulated)</dd></div>
              <div><dt>Liveness status</dt><dd><span className={`cj-pill cj-pill-${outcome.tone}`}>{outcome.text}</span></dd></div>
              <div><dt>Face-match score</dt><dd>{lv.result.demoScorePct}% <span className="cj-demo-tag">DEMO</span></dd></div>
              <div><dt>Source of result</dt><dd>{providers.liveness.meta.name}</dd></div>
              <div><dt>Step status</dt><dd>{journey && <StepStatusPill status={journey.liveness.status} />}</dd></div>
            </dl>
            {lv.result.outcome === "demo_failed" && <Notice tone="error" title="Demo check failed">Retake the photo to try again.</Notice>}
            {lv.result.outcome === "demo_review" && <Notice tone="warn" title="Review required">A reviewer would look at this. You can continue.</Notice>}
            {lv.result.outcome === "demo_passed" && <Notice tone="success" title="Demo check passed">This is a simulation only. It is not a real identity match.</Notice>}
          </>
        )}
      </section>
    </StepFrame>
  );
}
