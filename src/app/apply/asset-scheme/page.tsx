"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AssetFields } from "@/components/journey/AssetFields";
import { FormAlert } from "@/components/journey/fields";
import { useJourney } from "@/components/journey/JourneyProvider";
import { money, pct, Row } from "@/components/journey/MoneyRows";
import { DemoNotice, Notice } from "@/components/journey/Notices";
import { StepFrame } from "@/components/journey/StepFrame";
import { StepGate } from "@/components/journey/StepGate";
import { useCatalog } from "@/components/journey/useCatalog";
import { useSchemes } from "@/components/journey/useSchemes";
import { useStepForm } from "@/components/journey/useStepForm";
import type { AssetSelection, Errors, JourneyDraft } from "@/lib/journey/types";
import { validateAsset } from "@/lib/journey/validation";

export default function AssetSchemePage() {
  return <StepGate step="asset">{(draft) => <AssetScheme initial={draft} />}</StepGate>;
}

type Form = AssetSelection & { schemeId: string };
const validate = (v: Form): Errors => ({ ...validateAsset(v), ...(v.schemeId ? {} : { schemeId: "Choose a scheme" }) });
const sameProduct = (a: AssetSelection, b: AssetSelection) => a.productType === b.productType && a.manufacturer === b.manufacturer && a.model === b.model && a.variant === b.variant;

function AssetScheme({ initial }: { initial: JourneyDraft }) {
  const router = useRouter();
  const { update, providers } = useJourney();
  const [busy, setBusy] = useState(false);
  const form = useStepForm<Form>({ ...initial.asset, schemeId: initial.schemeId }, validate);
  const { values, setValues, blur, errors } = form;
  const { detail } = useCatalog(providers.catalog, values);
  const ctx = detail ? { assetPricePaise: detail.pricePaise, stepUp: values.stepUp, suspectedActivity: values.suspectedActivity } : null;
  const { rows, failed } = useSchemes(providers.schemes, ctx);
  const chosen = rows.find((r) => r.scheme.id === values.schemeId);
  const chosenBlocked = chosen?.eligibility.status === "not_eligible";
  // If the selected scheme stops being eligible (for example the step-up answer changed) it is dropped, never silently kept.
  const effectiveScheme = chosenBlocked ? "" : values.schemeId;

  const apply = (d: JourneyDraft): JourneyDraft => {
    const { schemeId: _s, ...asset } = values;
    void _s;
    return { ...d, asset, schemeId: effectiveScheme };
  };
  const persist = () => update(apply);

  async function next() {
    if (!form.check()) return;
    if (chosenBlocked) {
      setValues({ ...values, schemeId: "" });
      return;
    }
    setBusy(true);
    try {
      await persist();
      form.markSaved();
      router.push("/apply/add-ons");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepFrame
      step="asset"
      title="Asset & Scheme Selection"
      subtitle="Confirm the item and choose a scheme. Scheme availability depends on your answers."
      dirty={form.dirty}
      onSaveBeforeLeave={async () => { await persist(); }}
      back={{ label: "Back", onClick: async () => { await persist(); router.push("/apply/offer"); }, disabled: busy }}
      primary={{ label: "Save & Continue", onClick: next, busy, disabled: busy }}
    >
      <DemoNotice>The catalog, prices and schemes here are <strong>fictional demo data</strong>. No scheme is promised and none is chosen for you.</DemoNotice>
      <form className="cj-card" noValidate onSubmit={(e) => { e.preventDefault(); void next(); }} aria-label="Asset and scheme">
        <FormAlert count={Object.keys(errors).length} />
        <AssetFields
          values={values}
          onChange={(a) => setValues({ ...values, ...a, schemeId: sameProduct(a, values) ? values.schemeId : "" })}
          errors={errors}
          blur={blur}
        />
        {values.suspectedActivity === "yes" && <Notice tone="warn" title="Marked for review">Your answer sends this application for review. It is not rejected.</Notice>}
      </form>

      {detail && (
        <section className="cj-card" aria-labelledby="summary-title">
          <h2 id="summary-title">Selected product</h2>
          <dl className="cj-kv">
            <Row label="Product">{detail.manufacturerLabel} {detail.modelLabel}, {detail.variantLabel}</Row>
            <Row label="Category">{detail.category} / {detail.subCategory}</Row>
            <Row label={<>Asset price <span className="cj-demo-tag">DEMO</span></>}>{money(detail.pricePaise)}</Row>
          </dl>
        </section>
      )}

      <section className="cj-card" aria-labelledby="scheme-title">
        <h2 id="scheme-title">Schemes <span className="cj-demo-tag">DEMO</span></h2>
        {!detail && <p className="cj-muted">Choose a product, manufacturer, model and variant to see the schemes available for it.</p>}
        {failed && <Notice tone="error">The demo schemes could not be loaded.</Notice>}
        {detail && rows.length > 0 && (
          <fieldset className="cj-fieldset" aria-describedby={errors.schemeId ? "f-schemeId-err" : undefined}>
            <legend className="cj-label">Choose a scheme <span className="cj-req" aria-hidden="true">*</span><span className="sr-only"> (required)</span></legend>
            <div className="cj-options">
              {rows.map(({ scheme, eligibility }, i) => {
                const blocked = eligibility.status === "not_eligible";
                const selected = values.schemeId === scheme.id;
                return (
                  <label key={scheme.id} className={`cj-option${selected ? " is-selected" : ""}${blocked ? " is-disabled" : ""}`}>
                    <span className="cj-option-head">
                      <span>
                        <input
                          id={i === 0 ? "f-schemeId" : undefined}
                          type="radio" name="schemeId" value={scheme.id} checked={selected} disabled={blocked}
                          onChange={() => setValues({ ...values, schemeId: scheme.id })} onBlur={() => blur("schemeId")}
                        />{" "}
                        <strong>{scheme.name}</strong>
                      </span>
                      <span className={`cj-pill cj-pill-${eligibility.status === "eligible" ? "completed" : eligibility.status === "review_required" ? "review_required" : "pending"}`}>
                        {eligibility.status === "eligible" ? "Eligible (demo)" : eligibility.status === "review_required" ? "Review required" : "Not available"}
                      </span>
                    </span>
                    <span className="cj-muted">{scheme.description}</span>
                    <span className="cj-muted small">{scheme.tenureMonths} months &middot; {pct(scheme.annualRateBps)} &middot; {(scheme.downPaymentBps / 100).toFixed(0)}% down payment</span>
                    {eligibility.reasons.map((r) => <span key={r} className="cj-journey-note">{r}</span>)}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        {errors.schemeId && detail && <p id="f-schemeId-err" className="cj-error" role="alert">{errors.schemeId}</p>}
        {chosen && !chosenBlocked && (
          <Notice tone="info" title="Selected scheme">
            {chosen.scheme.name}: {chosen.scheme.tenureMonths} months at an illustrative {pct(chosen.scheme.annualRateBps)}. Final terms depend on an authorized lender&apos;s assessment.
          </Notice>
        )}
        {chosenBlocked && <Notice tone="warn" title="This scheme is not available">Your answers changed, so this scheme can no longer be selected. Choose another.</Notice>}
      </section>
    </StepFrame>
  );
}
