"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { CjBrand } from "@/components/journey/CjBrand";
import { ConfirmDialog } from "@/components/journey/ConfirmDialog";
import { useJourney } from "@/components/journey/JourneyProvider";
import { Notice } from "@/components/journey/Notices";
import { OverallPill } from "@/components/journey/OverallPill";
import { overallStatus, progressPercent, stepDef, nextStep } from "@/lib/journey/machine";
import { formatDateTime } from "@/lib/format";

export default function ApplyEntry() {
  const router = useRouter();
  const { ready, draft, journey, startNew, discard, persistent } = useJourney();
  const [busy, setBusy] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [error, setError] = useState("");

  async function start(first: boolean) {
    setBusy(true);
    setError("");
    try {
      if (!first) await discard();
      await startNew();
      router.push("/apply/basic-details");
    } catch {
      setError("Could not start a new application in this browser. Check that storage is allowed and try again.");
      setBusy(false);
    }
  }

  const next = journey ? nextStep(journey) : null;
  const overall = journey && draft ? overallStatus(journey, draft) : null;

  return (
    <div className="cj">
      <header className="cj-header">
        <div className="cj-header-inner">
          <Link href="/apply" className="cj-brandlink" aria-label="Demo Finance home"><CjBrand /></Link>
          <div className="cj-header-right">
            <Link href="/" className="cj-navlink"><Icon name="home" size={18} />Site home</Link>
          </div>
        </div>
      </header>
      <div className="cj-shell cj-shell-narrow">
        <main id="main" className="cj-main" tabIndex={-1}>
          <section className="cj-hero" aria-labelledby="hero-title">
            <span className="cj-demo-tag">DEMO ONLY</span>
            <h1 id="hero-title">Apply for finance in a few guided steps</h1>
            <p>
              This walks through a shop-assisted finance application: your details, a demo KYC step, a demo selfie check, an
              illustrative offer, the item and scheme, optional add-ons, and an itemised calculation.
            </p>
            <div className="cj-actions">
              {ready && draft ? (
                <button type="button" className="cj-btn cj-btn-secondary" onClick={() => setConfirmNew(true)} disabled={busy}>Start a new application</button>
              ) : (
                <button type="button" className="cj-btn cj-btn-primary" onClick={() => start(true)} disabled={!ready || busy} aria-busy={busy ? true : undefined}>
                  {busy && <span className="spinner" aria-hidden="true" />}
                  Start Application
                </button>
              )}
            </div>
          </section>

          {ready && draft && journey && (
            <section className="cj-existing" aria-labelledby="existing-title">
              <h2 id="existing-title">Continue your application</h2>
              <p>
                Reference <strong>{draft.reference}</strong>
                {overall && <> &middot; {overall === "completed" ? "Demo journey completed" : overall === "review_required" ? "Review required" : overall === "failed" ? "Needs attention" : "In progress"}</>}
              </p>
              <p className="cj-muted small">{progressPercent(journey)}% of steps passed &middot; last saved {formatDateTime(draft.updatedAt)}</p>
              <div className="cj-actions">
                <Link href={next && next !== "done" ? stepDef(next).path : "/apply/complete"} className="cj-btn cj-btn-primary">
                  Continue Existing Application <Icon name="arrowRight" size={18} />
                </Link>
                <Link href="/apply/journey" className="cj-btn cj-btn-secondary">View journey</Link>
              </div>
              {overall && <OverallPill status={overall} />}
            </section>
          )}

          {error && <Notice tone="error">{error}</Notice>}
          {ready && !persistent && (
            <Notice tone="warn" title="Browser storage is blocked">
              Your progress will be kept only while this page stays open.
            </Notice>
          )}

          <section className="cj-card" aria-labelledby="how-title">
            <h2 id="how-title">What happens in this demo</h2>
            <ul className="cj-list">
              <li>Every verification result is <strong>simulated</strong>. Nothing is sent to PAN, DigiLocker, SMS, bureau or lender systems.</li>
              <li>No loan is approved or offered. Figures are illustrative and always labelled DEMO or INDICATIVE.</li>
              <li>Use <strong>fictional</strong> details only. Do not enter your real PAN, Aadhaar or other identity numbers.</li>
              <li>The selfie step asks for camera access only after you press Start, and the photo never leaves your device.</li>
            </ul>
          </section>

          <section className="cj-card" aria-labelledby="privacy-title">
            <h2 id="privacy-title">Privacy and where your answers are kept</h2>
            <p className="cj-muted">
              In this demo your answers are saved in <strong>this browser only</strong> so you can leave and come back. They are not sent to a server,
              and they are deleted automatically after 7 days. A PAN you type is shown masked and is never saved. You can remove everything now:
            </p>
            <div className="cj-actions">
              <button
                type="button"
                className="cj-btn cj-btn-secondary"
                disabled={!draft}
                onClick={async () => { await discard(); }}
              >
                Delete my demo application
              </button>
            </div>
          </section>
        </main>
      </div>

      <ConfirmDialog
        open={confirmNew}
        title="Start a new application?"
        onClose={() => setConfirmNew(false)}
        actions={
          <>
            <button type="button" className="cj-btn cj-btn-ghost" onClick={() => setConfirmNew(false)}>Cancel</button>
            <button type="button" className="cj-btn cj-btn-primary" onClick={() => { setConfirmNew(false); void start(false); }}>Replace and start new</button>
          </>
        }
      >
        <p>Your current application ({draft?.reference}) will be deleted from this browser and a new reference will be created.</p>
      </ConfirmDialog>
    </div>
  );
}
