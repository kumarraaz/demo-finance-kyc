"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AssetFields } from "@/components/journey/AssetFields";
import { DemographicsHeader } from "@/components/journey/DemographicsHeader";
import { FormAlert } from "@/components/journey/fields";
import { useJourney } from "@/components/journey/JourneyProvider";
import { Notice } from "@/components/journey/Notices";
import { StepFrame } from "@/components/journey/StepFrame";
import { StepGate } from "@/components/journey/StepGate";
import { useStepForm } from "@/components/journey/useStepForm";
import type { AssetSelection, JourneyDraft } from "@/lib/journey/types";
import { validateAsset } from "@/lib/journey/validation";

export default function AssetDetailsPage() {
  return <StepGate step="demographics">{(draft) => <AssetDetailsForm initial={draft} />}</StepGate>;
}

function AssetDetailsForm({ initial }: { initial: JourneyDraft }) {
  const router = useRouter();
  const { update } = useJourney();
  const [busy, setBusy] = useState(false);
  const form = useStepForm<AssetSelection>(initial.asset, validateAsset);
  const { values, setValues, blur, errors } = form;

  /** A changed product invalidates the scheme chosen for the old one, so the scheme must be picked again. */
  const apply = (d: JourneyDraft): JourneyDraft => {
    const a = d.asset;
    const productChanged = a.productType !== values.productType || a.manufacturer !== values.manufacturer || a.model !== values.model || a.variant !== values.variant;
    return { ...d, asset: values, schemeId: productChanged ? "" : d.schemeId };
  };
  const persist = () => update(apply);

  async function save() {
    if (!form.check()) return;
    setBusy(true);
    try {
      await persist();
      form.markSaved();
      router.push("/apply/journey");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepFrame
      step="demographics"
      title="Demographic Details"
      subtitle="Step 3 of 3: the item you want to finance."
      stepLabel="Demographic Details: Step 3/3"
      dirty={form.dirty}
      onSaveBeforeLeave={async () => { await persist(); }}
      back={{ label: "Back", onClick: async () => { await persist(); router.push("/apply/demographics/address"); }, disabled: busy }}
      primary={{ label: "Save", onClick: save, busy, disabled: busy }}
    >
      <DemographicsHeader draft={initial} step={3} />
      <Notice tone="info" title="About eligibility">
        Which schemes you can choose, and whether an application is accepted, depends on business rules applied by an authorized lender. Nothing here
        promises approval, and an answer on this page never rejects the application on its own.
      </Notice>
      <form className="cj-card" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} aria-label="Asset details">
        <FormAlert count={Object.keys(errors).length} />
        <AssetFields values={values} onChange={setValues} errors={errors} blur={blur} />
        {values.suspectedActivity === "yes" && (
          <Notice tone="warn" title="Marked for review">Your answer marks this application for review. It is not rejected.</Notice>
        )}
      </form>
    </StepFrame>
  );
}
