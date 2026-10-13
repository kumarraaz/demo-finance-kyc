"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { CheckboxField, Field } from "@/components/journey/fields";
import { useJourney } from "@/components/journey/JourneyProvider";
import { DemoNotice, Notice } from "@/components/journey/Notices";
import { KycPill, kycDisplayStatus } from "@/components/journey/StatusPill";
import { StepFrame } from "@/components/journey/StepFrame";
import { StepGate } from "@/components/journey/StepGate";
import { formatDateTime } from "@/lib/format";
import type { JourneyDraft } from "@/lib/journey/types";

export default function KycPage() {
  return <StepGate step="kyc">{() => <KycForm />}</StepGate>;
}

function KycForm() {
  const router = useRouter();
  const { draft, journey, update, providers } = useJourney();
  const rules = providers.rules;
  const kyc = draft!.kyc;
  const reference = draft!.reference;

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "request" | "verify" | "cancel">("");
  const [consentError, setConsentError] = useState("");
  const [now, setNow] = useState(0);
  const [live, setLive] = useState("");

  const issued = kyc.status === "demo_otp_issued";
  useEffect(() => {
    if (!issued) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [issued]);

  const secondsLeft = issued && kyc.resendAvailableAt ? Math.max(0, Math.ceil((new Date(kyc.resendAvailableAt).getTime() - now) / 1000)) : 0;
  const display = kycDisplayStatus(kyc.status, kyc.consent);
  const done = journey?.kyc.status === "completed";

  const patchKyc = (p: Partial<JourneyDraft["kyc"]>) => update((d) => ({ ...d, kyc: { ...d.kyc, ...p } }));

  async function request(isResend: boolean) {
    if (!kyc.consent) {
      setConsentError("Give consent first to request a demo verification");
      return;
    }
    setBusy("request");
    setError("");
    setOtp("");
    try {
      await patchKyc({ status: "request_pending", requestedAt: new Date().toISOString(), resendAvailableAt: undefined, verifiedAt: undefined, documentSummary: undefined });
      const r = await providers.kyc.requestVerification({ reference, consent: true });
      await patchKyc({ status: r.status, requestedAt: r.requestedAt, resendAvailableAt: r.resendAvailableAt, attemptsLeft: rules.otp.maxAttempts });
      setLive(r.status === "demo_otp_issued" ? (isResend ? "A new demo code was issued. No SMS was sent." : "A demo code was issued. No SMS was sent.") : "The demo request did not start. See the status above.");
    } catch {
      await patchKyc({ status: "failed", resendAvailableAt: undefined });
      setError("The demo verification request could not be made. Try again.");
    } finally {
      setBusy("");
    }
  }

  async function verify() {
    if (!new RegExp(`^\\d{${rules.otp.length}}$`).test(otp)) {
      setError(`Enter the ${rules.otp.length}-digit demo code`);
      document.getElementById("f-otp")?.focus();
      return;
    }
    setBusy("verify");
    setError("");
    try {
      const r = await providers.kyc.verifyOtp({ reference, otp, resumeAttemptsLeft: kyc.attemptsLeft });
      setOtp(""); // the code is never kept
      if (r.status === "demo_verified") {
        await patchKyc({ status: "demo_verified", verifiedAt: r.verifiedAt, documentSummary: r.documentSummary, attemptsLeft: r.attemptsLeft });
        setLive("Demo verification complete. This was a simulation.");
      } else if (r.status === "failed") {
        await patchKyc({ status: "failed", attemptsLeft: 0 });
        setError("Too many incorrect codes. Request a new demo code.");
      } else {
        await patchKyc({ attemptsLeft: r.attemptsLeft });
        setError(`That code is not correct. ${r.attemptsLeft} ${r.attemptsLeft === 1 ? "attempt" : "attempts"} left.`);
        document.getElementById("f-otp")?.focus();
      }
    } catch {
      setError("The demo code could not be checked. Try again.");
    } finally {
      setBusy("");
    }
  }

  async function cancel() {
    setBusy("cancel");
    try {
      setOtp("");
      setError("");
      await patchKyc({ status: "cancelled", resendAvailableAt: undefined });
    } finally {
      setBusy("");
    }
  }

  return (
    <StepFrame
      step="kyc"
      title="KYC Details"
      subtitle="Retrieve identity and address documents. In this demo the retrieval is simulated."
      back={{ label: "Back", href: "/apply/basic-details" }}
      primary={{ label: "Continue", onClick: () => router.push("/apply/demographics/personal"), disabled: !done }}
      note={done ? "Demo verification complete" : "Complete the demo verification to continue"}
    >
      <DemoNotice>
        No DigiLocker or SMS service is connected. The request below is <strong>simulated</strong>: no code is texted, and no identity
        document, Aadhaar number or authentication token is retrieved or stored.
      </DemoNotice>

      <section className="cj-card" aria-labelledby="docs-title">
        <div className="cj-card-head">
          <h2 id="docs-title">Document retrieval <span className="cj-demo-tag">DEMO</span></h2>
          <KycPill status={display} />
        </div>
        <dl className="cj-kv">
          <div><dt>Application reference</dt><dd>{reference}</dd></div>
          <div><dt>Provider</dt><dd>{providers.kyc.meta.name}</dd></div>
          <div><dt>Integration status</dt><dd>Integration required (not connected)</dd></div>
        </dl>

        <CheckboxField
          name="kycConsent"
          required
          checked={kyc.consent}
          error={consentError}
          onChange={async (v) => {
            setConsentError("");
            await patchKyc(v ? { consent: true } : { consent: false, status: "not_started", resendAvailableAt: undefined, attemptsLeft: undefined });
            if (!v) { setOtp(""); setError(""); }
          }}
          label="I consent to retrieving my identity and address documents for this demo application. I understand nothing real is retrieved."
        />

        {kyc.status === "request_pending" && <Notice tone="info" title="Request pending">The demo request is being made…</Notice>}
        {!issued && kyc.status !== "demo_verified" && kyc.status !== "request_pending" && (
          <div>
            <button type="button" className="cj-btn cj-btn-primary" onClick={() => request(false)} disabled={busy !== ""} aria-busy={busy === "request" ? true : undefined}>
              {busy === "request" && <span className="spinner" aria-hidden="true" />}
              {kyc.status === "failed" || kyc.status === "cancelled" ? "Request verification again (demo)" : "Request verification (demo)"}
            </button>
          </div>
        )}
      </section>

      {issued && (
        <section className="cj-card" aria-labelledby="otp-title">
          <h2 id="otp-title">Enter the demo code</h2>
          <Notice tone="demo" title="Demo code">
            No SMS was sent. In this demo the code is <strong>{rules.otp.demoCode}</strong>. A real service would text a private code to your phone.
          </Notice>
          <form
            className="cj-field"
            noValidate
            onSubmit={(e) => { e.preventDefault(); void verify(); }}
          >
            <Field name="otp" label={`${rules.otp.length}-digit code`} required hint={kyc.attemptsLeft !== undefined ? `${kyc.attemptsLeft} ${kyc.attemptsLeft === 1 ? "attempt" : "attempts"} left` : undefined} error={error}>
              {(aria) => (
                <input
                  {...aria}
                  name="otp"
                  className="cj-input cj-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={rules.otp.length}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, rules.otp.length))}
                />
              )}
            </Field>
            <div className="cj-actions">
              <button type="submit" className="cj-btn cj-btn-primary" disabled={busy !== ""} aria-busy={busy === "verify" ? true : undefined}>
                {busy === "verify" && <span className="spinner" aria-hidden="true" />}
                Verify code (demo)
              </button>
              <button type="button" className="cj-btn cj-btn-secondary" onClick={() => request(true)} disabled={busy !== "" || secondsLeft > 0}>
                <Icon name="refresh" size={18} />
                {secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : "Resend code"}
              </button>
              <button type="button" className="cj-btn cj-btn-ghost" onClick={cancel} disabled={busy !== ""}>Cancel request</button>
            </div>
          </form>
        </section>
      )}

      {!issued && error && <Notice tone="error">{error}</Notice>}
      {kyc.status === "failed" && <Notice tone="error" title="Demo verification failed">Request a new demo code to try again.</Notice>}
      {kyc.status === "cancelled" && <Notice tone="warn" title="Request cancelled">You cancelled the demo request. Request it again when you are ready.</Notice>}
      {kyc.status === "demo_verified" && <Notice tone="success" title="Demo verification complete">This is a simulated result. It is not a DigiLocker or authority result.</Notice>}

      <section className="cj-card" aria-labelledby="summary-title">
        <h2 id="summary-title">Retrieved document summary <span className="cj-demo-tag">PLACEHOLDER</span></h2>
        <dl className="cj-kv">
          <div><dt>Document source</dt><dd>{kyc.documentSource}</dd></div>
          <div><dt>Retrieved at</dt><dd>{kyc.verifiedAt ? `${formatDateTime(kyc.verifiedAt)} (demo)` : "Not retrieved"}</dd></div>
          <div><dt>Status</dt><dd>{kyc.status === "demo_verified" ? "Demo placeholder only" : "Not retrieved"}</dd></div>
        </dl>
        <p className="cj-muted">{kyc.documentSummary ?? "When a real document service is connected, a summary of the retrieved document would appear here. In the demo no document content is retrieved or stored."}</p>
      </section>
      <p className="sr-only" role="status" aria-live="polite">{live}</p>
    </StepFrame>
  );
}
