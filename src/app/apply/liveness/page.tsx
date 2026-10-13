"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { CheckboxField } from "@/components/journey/fields";
import { useJourney } from "@/components/journey/JourneyProvider";
import { LivenessIllustration } from "@/components/journey/LivenessIllustration";
import { DemoNotice, Notice } from "@/components/journey/Notices";
import { StepFrame } from "@/components/journey/StepFrame";
import { StepGate } from "@/components/journey/StepGate";
import { openCameraScreen } from "@/lib/journey/liveness-session";

const TIPS = [
  "Find good, even lighting. Face a window or a lamp, not a bright light behind you.",
  "Remove glasses if you can, so your eyes are visible.",
  "Take off hats, caps and anything covering your forehead or face.",
  "Keep your whole face inside the oval and look at the camera.",
  "Choose a plain background without people or moving objects.",
];

export default function LivenessIntroPage() {
  return <StepGate step="liveness">{() => <LivenessIntro />}</StepGate>;
}

function LivenessIntro() {
  const { draft, update, providers } = useJourney();
  const [error, setError] = useState("");
  const consent = draft!.liveness.consent;

  function start() {
    if (!consent) {
      setError("Give your consent to continue");
      document.getElementById("f-livenessConsent")?.focus();
      return;
    }
    // A real page load (the camera is only allowed on that screen's own response); permission may be requested there
    // straight away because the person just pressed Start.
    openCameraScreen(true);
  }

  return (
    <StepFrame
      step="liveness"
      title="Liveness Check"
      subtitle="A short selfie check. In this demo the result is simulated."
      back={{ label: "Back", href: "/apply/journey" }}
      primary={{ label: "Start Verification", onClick: start, icon: <Icon name="camera" size={18} /> }}
    >
      <DemoNotice>
        This is a <strong>demonstration</strong>. Your photo is not uploaded, saved or compared with anyone. The result shown afterwards comes from a fixed demo
        fixture and is labelled DEMO.
      </DemoNotice>

      <section className="cj-card" aria-labelledby="how-title">
        <div className="cj-illus"><LivenessIllustration /></div>
        <h2 id="how-title">How the selfie check works</h2>
        <p className="cj-muted">
          You take one photo with your camera. A real service would check that a live person is present and compare the photo with a reference. Here that
          is simulated.
        </p>
        <ul className="cj-tips">
          {TIPS.map((t) => (
            <li key={t}><Icon name="checkCircle" size={18} /><span>{t}</span></li>
          ))}
        </ul>
      </section>

      <section className="cj-card" aria-labelledby="consent-title">
        <h2 id="consent-title">Consent and privacy</h2>
        <Notice tone="info" title="Real biometric checks need an authorized provider">
          Processing a face for real identity checks requires an authorized provider and your explicit, informed consent. No provider is connected in this demo.
        </Notice>
        <ul className="cj-list">
          <li>The camera starts only after you press Start Verification and allow it in your browser.</li>
          <li>The photo stays in this browser tab&apos;s memory. It is not uploaded, not saved to disk and not sent anywhere.</li>
          <li>It is discarded when you retake, leave this flow or close the tab. Only a note that a photo was taken, and the demo result, are kept.</li>
          <li>You can pick a clearly marked simulated option if you prefer not to use the camera.</li>
        </ul>
        <CheckboxField
          name="livenessConsent"
          required
          checked={consent}
          error={error}
          onChange={async (v) => { setError(""); await update((d) => ({ ...d, liveness: { ...d.liveness, consent: v, ...(v ? {} : { captured: false, source: "" as const, result: undefined, capturedAt: undefined }) } })); }}
          label="I consent to using my camera for this demo selfie check and I have read how my photo is handled."
        />
        <dl className="cj-kv">
          <div><dt>Provider</dt><dd>{providers.liveness.meta.name}</dd></div>
          <div><dt>Integration status</dt><dd>Integration required (not connected)</dd></div>
        </dl>
      </section>
    </StepFrame>
  );
}
