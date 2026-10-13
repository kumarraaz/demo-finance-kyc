"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckboxField, FormAlert, TextField } from "@/components/journey/fields";
import { useJourney } from "@/components/journey/JourneyProvider";
import { Notice, DemoNotice } from "@/components/journey/Notices";
import { StepFrame } from "@/components/journey/StepFrame";
import { StepGate } from "@/components/journey/StepGate";
import { VerificationPill } from "@/components/journey/StatusPill";
import { useStepForm } from "@/components/journey/useStepForm";
import { basicIdentityChanged, simulateBasicVerification } from "@/lib/journey/basic-verification";
import { maskPan } from "@/lib/journey/mask";
import { isValidPan, normalizePan, validateBasic } from "@/lib/journey/validation";
import type { JourneyDraft } from "@/lib/journey/types";

type Form = { mobile: string; dob: string; panName: string; panRaw: string; fictionalConfirmed: boolean };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isoYearsAgo = (years: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
};

export default function BasicDetailsPage() {
  return <StepGate step="basic">{(draft) => <BasicForm initial={draft} />}</StepGate>;
}

function BasicForm({ initial }: { initial: JourneyDraft }) {
  const router = useRouter();
  const { draft, update } = useJourney();
  const stored = initial.basic;
  // The context draft is the live one (statuses change after verification); `initial` only seeds the inputs.
  const basic = draft?.basic ?? stored;
  const [editingPan, setEditingPan] = useState(!stored.panFormatValid);
  const [busy, setBusy] = useState<"" | "save" | "verify" | "next">("");
  const [message, setMessage] = useState("");
  const [needVerify, setNeedVerify] = useState(false);
  const [live, setLive] = useState("");

  const form = useStepForm<Form>(
    { mobile: stored.mobile, dob: stored.dob, panName: stored.panName, panRaw: "", fictionalConfirmed: stored.fictionalConfirmed },
    (v) => validateBasic({ ...v, panMasked: editingPan ? "" : basic.panMasked, panFormatValid: editingPan ? false : basic.panFormatValid }),
  );
  const { values, set, blur, errors } = form;

  /** Pure change applied to the draft. A raw PAN is reduced to its masked form here and never stored. */
  const apply = (d: JourneyDraft): JourneyDraft => {
    const raw = normalizePan(values.panRaw);
    const rawValid = isValidPan(raw);
    const panMasked = editingPan ? (rawValid ? maskPan(raw) : "") : d.basic.panMasked;
    const next = {
      ...d.basic, mobile: values.mobile, dob: values.dob, panName: values.panName.trim(), panMasked,
      panFormatValid: editingPan ? rawValid : d.basic.panFormatValid, fictionalConfirmed: values.fictionalConfirmed,
    };
    // Verification belongs to the exact values that were checked: changing any of them clears it.
    return { ...d, basic: basicIdentityChanged(d.basic, next) ? { ...next, mobileStatus: "not_started", panStatus: "not_started" } : next };
  };
  const persist = async () => update(apply);

  async function onSave() {
    setBusy("save");
    try {
      await persist();
      form.markSaved();
      setMessage(`Progress saved at ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.`);
    } finally {
      setBusy("");
    }
  }

  async function onVerify() {
    if (!form.check()) return;
    setBusy("verify");
    setNeedVerify(false);
    try {
      await update((d) => {
        const a = apply(d);
        return { ...a, basic: { ...a.basic, mobileStatus: "pending", panStatus: "pending" } };
      });
      setLive("Running the simulated verification…");
      await sleep(700);
      await update((d) => {
        const r = simulateBasicVerification(d.basic);
        return { ...d, basic: { ...d.basic, mobileStatus: r.mobile, panStatus: r.pan } };
      });
      form.markSaved();
      setEditingPan(false);
      set("panRaw", "");
      setLive("Simulated verification finished. This was a demo; no real check was made.");
    } finally {
      setBusy("");
    }
  }

  async function onContinue() {
    if (!form.check()) return;
    setBusy("next");
    try {
      const saved = await persist();
      form.markSaved();
      if (saved.basic.mobileStatus !== "demo_verified" || saved.basic.panStatus !== "demo_verified") {
        setNeedVerify(true);
        return;
      }
      router.push("/apply/kyc");
    } finally {
      setBusy("");
    }
  }

  const errorCount = Object.keys(errors).length;
  const verified = basic.mobileStatus === "demo_verified" && basic.panStatus === "demo_verified";
  const failed = basic.mobileStatus === "failed" || basic.panStatus === "failed";

  return (
    <StepFrame
      step="basic"
      title="Basic Details"
      subtitle="Tell us who is applying. Use fictional test details only."
      stepLabel="Step 1 of 8: Basic Details"
      dirty={form.dirty}
      onSaveBeforeLeave={async () => { await persist(); }}
      back={{ label: "Back", onClick: async () => { await persist(); router.push("/apply"); }, disabled: busy !== "" }}
      secondary={{ label: "Save progress", onClick: onSave, busy: busy === "save", disabled: busy !== "" }}
      primary={{ label: "Continue", onClick: onContinue, busy: busy === "next", disabled: busy !== "" }}
      note={message}
    >
      <DemoNotice>
        Verification here is <strong>simulated</strong>. No SMS is sent and your PAN is not checked with any authority. Enter a{" "}
        <strong>fictional</strong> PAN in the format ABCPE1234F. Do not enter your real PAN.
      </DemoNotice>

      <form className="cj-card" noValidate onSubmit={(e) => { e.preventDefault(); onContinue(); }} aria-label="Basic details form">
        <FormAlert count={errorCount} />
        {needVerify && <FormAlert count={0} extra="Run the demo verification before continuing. Both the mobile and PAN checks must show Demo Verified." />}
        <div className="cj-grid cj-grid-2">
          <TextField
            name="mobile" label="Mobile number" required type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10}
            value={values.mobile} onChange={(v) => set("mobile", v)} onBlur={() => blur("mobile")} error={errors.mobile}
            transform={(v) => v.replace(/\D/g, "").slice(0, 10)} hint="10-digit Indian mobile number. No SMS is sent in this demo."
          />
          <TextField
            name="dob" label="Date of birth" required type="date" autoComplete="bday" value={values.dob}
            onChange={(v) => set("dob", v)} onBlur={() => blur("dob")} error={errors.dob} min={isoYearsAgo(70)} max={isoYearsAgo(18)}
            hint="You must be 18 to 70 years old."
          />
          <div className="cj-span-2">
            <TextField
              name="panName" label="Name as per PAN" required autoComplete="off" maxLength={100} value={values.panName}
              onChange={(v) => set("panName", v)} onBlur={() => blur("panName")} error={errors.panName}
            />
          </div>
          <div className="cj-span-2">
            {editingPan ? (
              <TextField
                name="pan" label="PAN (fictional test value)" required autoComplete="off" maxLength={10} spellCheck={false} value={values.panRaw}
                onChange={(v) => set("panRaw", v)} onBlur={() => blur("pan")} error={errors.pan}
                transform={(v) => v.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}
                hint="Format: five letters, four digits, one letter (for example ABCPE1234F). It is shown masked after you continue and is never saved."
              />
            ) : (
              <div className="cj-field">
                <span className="cj-label" id="pan-masked-label">PAN (masked)</span>
                <div className="cj-money">
                  <input id="f-pan-masked" className="cj-input" readOnly value={basic.panMasked} aria-labelledby="pan-masked-label" />
                  <button type="button" className="cj-btn cj-btn-secondary" onClick={() => { setEditingPan(true); set("panRaw", ""); }}>Change PAN</button>
                </div>
                <p className="cj-hint">The full PAN is not stored. To change it, enter it again.</p>
              </div>
            )}
          </div>
        </div>
        <CheckboxField
          name="fictionalConfirmed" required checked={values.fictionalConfirmed} onChange={(v) => set("fictionalConfirmed", v)}
          onBlur={() => blur("fictionalConfirmed")} error={errors.fictionalConfirmed}
          label="I confirm these details are fictional test data, not my real identity details."
        />
      </form>

      <section className="cj-card" aria-labelledby="verify-title">
        <div className="cj-card-head">
          <h2 id="verify-title">Verification status <span className="cj-demo-tag">DEMO</span></h2>
        </div>
        <div className="cj-badges">
          <VerificationPill status={basic.mobileStatus} label="Mobile" />
          <VerificationPill status={basic.panStatus} label="PAN" />
        </div>
        <p className="cj-muted">
          This runs a <strong>simulated</strong> check on the details above. A real PAN or OTP service is not connected, so a real verification is
          never claimed. Demo tip: a PAN whose last letter is X simulates a failed check.
        </p>
        {failed && <Notice tone="error" title="Demo verification failed">Correct the PAN, then run the demo verification again.</Notice>}
        {verified && <Notice tone="success" title="Demo verification complete">Both checks show Demo Verified. This is a simulation, not an authority&apos;s result.</Notice>}
        <div>
          <button type="button" className="cj-btn cj-btn-secondary" onClick={onVerify} disabled={busy !== ""} aria-busy={busy === "verify" ? true : undefined}>
            {busy === "verify" && <span className="spinner" aria-hidden="true" />}
            {verified ? "Run demo verification again" : "Run demo verification (simulated)"}
          </button>
        </div>
        <p className="sr-only" role="status" aria-live="polite">{live}</p>
      </section>
    </StepFrame>
  );
}
