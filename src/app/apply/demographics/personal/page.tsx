"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CurrencyField, FormAlert, RadioGroup, SelectField, TextField } from "@/components/journey/fields";
import { DemographicsHeader } from "@/components/journey/DemographicsHeader";
import { useJourney } from "@/components/journey/JourneyProvider";
import { StepFrame } from "@/components/journey/StepFrame";
import { StepGate } from "@/components/journey/StepGate";
import { useStepForm } from "@/components/journey/useStepForm";
import { formatRupees } from "@/lib/journey/money";
import { MARITAL_STATUSES, RELATIONS } from "@/lib/journey/states";
import type { JourneyDraft, PersonalDetails } from "@/lib/journey/types";
import { validatePersonal } from "@/lib/journey/validation";

export default function PersonalPage() {
  return <StepGate step="demographics">{(draft) => <PersonalForm initial={draft} />}</StepGate>;
}

const EMPLOYMENT = [
  { value: "self_employed", label: "Self Employed" },
  { value: "salaried", label: "Salaried" },
] as const;

function PersonalForm({ initial }: { initial: JourneyDraft }) {
  const router = useRouter();
  const { update } = useJourney();
  const [busy, setBusy] = useState(false);
  const form = useStepForm<PersonalDetails>(initial.personal, validatePersonal);
  const { values: v, set, blur, errors } = form;
  const self = v.employmentType === "self_employed";
  const salaried = v.employmentType === "salaried";

  /** Fields of the employment type that is not selected are cleared, so no stale answer is saved. */
  const apply = (d: JourneyDraft): JourneyDraft => ({
    ...d,
    personal: {
      ...v,
      firstName: v.firstName.trim(), middleName: v.middleName.trim(), lastName: v.lastName.trim(), email: v.email.trim(),
      fatherFirstName: v.fatherFirstName.trim(), fatherMiddleName: v.fatherMiddleName.trim(), fatherLastName: v.fatherLastName.trim(),
      businessName: self ? v.businessName.trim() : "",
      employerName: salaried ? v.employerName.trim() : "",
      employmentDurationMonths: salaried ? v.employmentDurationMonths : null,
      monthlyIncome: v.employmentType ? v.monthlyIncome : null,
    },
  });
  const persist = () => update(apply);

  async function next() {
    if (!form.check()) return;
    setBusy(true);
    try {
      await persist();
      form.markSaved();
      router.push("/apply/demographics/address");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepFrame
      step="demographics"
      title="Demographic Details"
      subtitle="Step 1 of 3: personal, family and employment details."
      stepLabel="Demographic Details: Step 1/3"
      dirty={form.dirty}
      onSaveBeforeLeave={async () => { await persist(); }}
      back={{ label: "Back", onClick: async () => { await persist(); router.push("/apply/kyc"); }, disabled: busy }}
      primary={{ label: "Save & Next", onClick: next, busy, disabled: busy }}
    >
      <DemographicsHeader draft={initial} step={1} />
      <form className="cj-card" noValidate onSubmit={(e) => { e.preventDefault(); void next(); }} aria-label="Personal, family and employment details">
        <FormAlert count={Object.keys(errors).length} />

        <fieldset className="cj-section cj-fieldset">
          <legend className="cj-section-title">Personal details</legend>
          <div className="cj-grid cj-grid-3">
            <TextField name="firstName" label="First name" required autoComplete="given-name" maxLength={100} value={v.firstName} onChange={(x) => set("firstName", x)} onBlur={() => blur("firstName")} error={errors.firstName} />
            <TextField name="middleName" label="Middle name" optional autoComplete="additional-name" maxLength={100} value={v.middleName} onChange={(x) => set("middleName", x)} onBlur={() => blur("middleName")} error={errors.middleName} />
            <TextField name="lastName" label="Last name" required autoComplete="family-name" maxLength={100} value={v.lastName} onChange={(x) => set("lastName", x)} onBlur={() => blur("lastName")} error={errors.lastName} />
          </div>
          <div className="cj-grid cj-grid-2">
            <TextField name="email" label="Email ID" optional type="email" inputMode="email" autoComplete="email" maxLength={254} value={v.email} onChange={(x) => set("email", x)} onBlur={() => blur("email")} error={errors.email} hint="Use a fictional address such as name@example.com." />
            <CurrencyField name="requestedAmount" label="Requested loan amount" required value={v.requestedAmount} onChange={(x) => set("requestedAmount", x)} onBlur={() => blur("requestedAmount")} error={errors.requestedAmount} formatted={formatRupees} hint={v.requestedAmount ? `${formatRupees(v.requestedAmount)} (between ₹10,000 and ₹50,00,000)` : "Between ₹10,000 and ₹50,00,000"} />
            <SelectField name="maritalStatus" label="Marital status" required value={v.maritalStatus} onChange={(x) => set("maritalStatus", x)} onBlur={() => blur("maritalStatus")} options={MARITAL_STATUSES} error={errors.maritalStatus} />
            <SelectField name="relation" label="Relationship" required value={v.relation} onChange={(x) => set("relation", x)} onBlur={() => blur("relation")} options={RELATIONS} error={errors.relation} hint="How you are related to the family member named below." />
          </div>
        </fieldset>

        <fieldset className="cj-section cj-fieldset">
          <legend className="cj-section-title">Family details</legend>
          <div className="cj-grid cj-grid-3">
            <TextField name="fatherFirstName" label="Father first name" required maxLength={100} value={v.fatherFirstName} onChange={(x) => set("fatherFirstName", x)} onBlur={() => blur("fatherFirstName")} error={errors.fatherFirstName} />
            <TextField name="fatherMiddleName" label="Father middle name" optional maxLength={100} value={v.fatherMiddleName} onChange={(x) => set("fatherMiddleName", x)} onBlur={() => blur("fatherMiddleName")} error={errors.fatherMiddleName} />
            <TextField name="fatherLastName" label="Father last name" required maxLength={100} value={v.fatherLastName} onChange={(x) => set("fatherLastName", x)} onBlur={() => blur("fatherLastName")} error={errors.fatherLastName} />
          </div>
        </fieldset>

        <fieldset className="cj-section cj-fieldset">
          <legend className="cj-section-title">Employment</legend>
          <RadioGroup name="employmentType" legend="Employment type" required value={v.employmentType} options={EMPLOYMENT} onChange={(x) => set("employmentType", x as PersonalDetails["employmentType"])} onBlur={() => blur("employmentType")} error={errors.employmentType} />
          {self && (
            <div className="cj-grid cj-grid-2">
              <TextField name="businessName" label="Business name" required maxLength={150} value={v.businessName} onChange={(x) => set("businessName", x)} onBlur={() => blur("businessName")} error={errors.businessName} />
              <CurrencyField name="monthlyIncome" label="Monthly income" required value={v.monthlyIncome} onChange={(x) => set("monthlyIncome", x)} onBlur={() => blur("monthlyIncome")} error={errors.monthlyIncome} formatted={formatRupees} />
            </div>
          )}
          {salaried && (
            <div className="cj-grid cj-grid-2">
              <TextField name="employerName" label="Employer or company name" required maxLength={150} value={v.employerName} onChange={(x) => set("employerName", x)} onBlur={() => blur("employerName")} error={errors.employerName} />
              <CurrencyField name="monthlyIncome" label="Monthly salary" required value={v.monthlyIncome} onChange={(x) => set("monthlyIncome", x)} onBlur={() => blur("monthlyIncome")} error={errors.monthlyIncome} formatted={formatRupees} />
              <TextField
                name="employmentDurationMonths" label="Employment duration (months)" optional inputMode="numeric" maxLength={3}
                value={v.employmentDurationMonths === null ? "" : String(v.employmentDurationMonths)}
                onChange={(x) => set("employmentDurationMonths", x === "" ? null : Number(x))} transform={(x) => x.replace(/\D/g, "")}
                onBlur={() => blur("employmentDurationMonths")} error={errors.employmentDurationMonths} hint="Whole months, for example 24."
              />
            </div>
          )}
        </fieldset>
      </form>
    </StepFrame>
  );
}
