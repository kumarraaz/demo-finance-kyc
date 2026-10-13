"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AddressFieldsGroup } from "@/components/journey/AddressFieldsGroup";
import { DemographicsHeader } from "@/components/journey/DemographicsHeader";
import { FormAlert, RadioGroup } from "@/components/journey/fields";
import { useJourney } from "@/components/journey/JourneyProvider";
import { Notice } from "@/components/journey/Notices";
import { StepFrame } from "@/components/journey/StepFrame";
import { StepGate } from "@/components/journey/StepGate";
import { useStepForm } from "@/components/journey/useStepForm";
import type { AddressDetails, JourneyDraft } from "@/lib/journey/types";
import { validateAddress } from "@/lib/journey/validation";

const YES_NO = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] as const;

export default function AddressPage() {
  return <StepGate step="demographics">{(draft) => <AddressForm initial={draft} />}</StepGate>;
}

const summary = (a: { line1: string; line2: string; landmark: string; city: string; state: string; pin: string; country: string }) =>
  [a.line1, a.line2, a.landmark, a.city, [a.state, a.pin].filter(Boolean).join(" "), a.country].map((x) => x.trim()).filter(Boolean).join(", ");

function AddressForm({ initial }: { initial: JourneyDraft }) {
  const router = useRouter();
  const { update, journey } = useJourney();
  const [busy, setBusy] = useState(false);
  const form = useStepForm<AddressDetails>(initial.address, validateAddress);
  const { values: v, patch, set, blur, errors } = form;
  const same = v.deliverySame === "yes";

  /** When delivery is "same", the saved delivery address is a copy of the address above, so the two can never drift apart. */
  const apply = (d: JourneyDraft): JourneyDraft => {
    const base = { line1: v.line1, line2: v.line2, landmark: v.landmark, city: v.city, state: v.state, pin: v.pin, country: v.country };
    return { ...d, address: { ...v, ...base, delivery: same ? { ...base } : v.delivery } };
  };
  const persist = () => update(apply);

  async function next() {
    if (!form.check()) return;
    setBusy(true);
    try {
      await persist();
      form.markSaved();
      router.push("/apply/demographics/asset");
    } finally {
      setBusy(false);
    }
  }

  const addressStatus =
    v.matchesDocument === "yes" ? { label: "Declared same as the document address (not verified)", tone: "in_progress" }
      : v.matchesDocument === "no" ? { label: "Review required: addresses differ", tone: "review_required" }
        : { label: "Not started", tone: "pending" };
  const personalDone = journey?.demographicSubsteps.personal.complete ?? true;

  return (
    <StepFrame
      step="demographics"
      title="Demographic Details"
      subtitle="Step 2 of 3: address details."
      stepLabel="Demographic Details: Step 2/3"
      dirty={form.dirty}
      onSaveBeforeLeave={async () => { await persist(); }}
      back={{ label: "Back", onClick: async () => { await persist(); router.push("/apply/demographics/personal"); }, disabled: busy }}
      primary={{ label: "Save & Next", onClick: next, busy, disabled: busy }}
    >
      <DemographicsHeader draft={initial} step={2} />
      {!personalDone && <Notice tone="warn" title="Step 1 is not finished">You can fill in your address now, but Step 1 must be saved before the Demographic Details step is complete.</Notice>}
      <div className="cj-card cj-compact">
        <dl className="cj-kv">
          <div><dt>Applicant</dt><dd>{[initial.personal.firstName, initial.personal.lastName].filter(Boolean).join(" ") || "-"}</dd></div>
          <div><dt>Address source</dt><dd>Entered manually (no document address in the demo)</dd></div>
          <div><dt>Address verification</dt><dd><span className={`cj-pill cj-pill-${addressStatus.tone}`}>{addressStatus.label}</span></dd></div>
        </dl>
      </div>

      <form className="cj-card" noValidate onSubmit={(e) => { e.preventDefault(); void next(); }} aria-label="Address details">
        <FormAlert count={Object.keys(errors).length} />
        <fieldset className="cj-section cj-fieldset">
          <legend className="cj-section-title">Current address</legend>
          <AddressFieldsGroup prefix="" idLabel="Current address" values={v} onChange={(a) => patch(a)} errors={errors} blur={blur} />
          {summary(v) && <p className="cj-muted" aria-live="polite"><strong>Address summary:</strong> {summary(v)}</p>}
        </fieldset>

        <RadioGroup
          name="matchesDocument" legend="Is your current address the same as the verified document address?" required value={v.matchesDocument} options={YES_NO}
          onChange={(x) => set("matchesDocument", x as AddressDetails["matchesDocument"])} onBlur={() => blur("matchesDocument")} error={errors.matchesDocument}
          hint="The demo did not retrieve a document address, so this is recorded as your declaration, not as a verified fact."
        />
        {v.matchesDocument === "no" && (
          <Notice tone="warn" title="This will be marked for review">
            A different address does not reject your application. It is flagged <strong>Review required</strong> so an authorized reviewer can confirm it.
          </Notice>
        )}

        <RadioGroup
          name="deliverySame" legend="Delivery address same as above?" required value={v.deliverySame} options={YES_NO}
          onChange={(x) => {
            // Copy the current address into an empty delivery address when the user switches to "No", so they edit rather than retype.
            const empty = !v.delivery.line1 && !v.delivery.city && !v.delivery.pin;
            patch({ deliverySame: x as AddressDetails["deliverySame"], ...(x === "no" && empty ? { delivery: { line1: v.line1, line2: v.line2, landmark: v.landmark, city: v.city, state: v.state, pin: v.pin, country: v.country } } : {}) });
          }}
          onBlur={() => blur("deliverySame")} error={errors.deliverySame}
        />
        {v.deliverySame === "yes" && <p className="cj-muted">Items will be delivered to the address above.</p>}
        {v.deliverySame === "no" && (
          <fieldset className="cj-section cj-fieldset">
            <legend className="cj-section-title">Delivery address</legend>
            <AddressFieldsGroup prefix="delivery" idLabel="Delivery address" values={v.delivery} onChange={(a) => set("delivery", a)} errors={errors} blur={blur} />
          </fieldset>
        )}
      </form>
    </StepFrame>
  );
}
