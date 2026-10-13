"use client";

import { SelectField, TextField } from "./fields";
import { INDIAN_STATES } from "@/lib/journey/states";
import type { AddressFields, Errors } from "@/lib/journey/types";

/** One postal address block. `prefix` namespaces the field names so two blocks can sit on one page. */
export function AddressFieldsGroup({
  prefix, values, onChange, errors, blur, idLabel,
}: {
  prefix: "" | "delivery"; values: AddressFields; onChange: (v: AddressFields) => void; errors: Errors; blur: (name: string) => void; idLabel: string;
}) {
  const n = (f: string) => (prefix ? `${prefix}.${f}` : f);
  const set = (f: keyof AddressFields, v: string) => onChange({ ...values, [f]: v });
  const states = INDIAN_STATES.map((s) => ({ value: s, label: s }));
  return (
    <div className="cj-grid cj-grid-2" role="group" aria-label={idLabel}>
      <div className="cj-span-2"><TextField name={n("line1")} label="Address line 1" required autoComplete={prefix ? "off" : "address-line1"} maxLength={150} value={values.line1} onChange={(v) => set("line1", v)} onBlur={() => blur(n("line1"))} error={errors[n("line1")]} /></div>
      <div className="cj-span-2"><TextField name={n("line2")} label="Address line 2" optional autoComplete={prefix ? "off" : "address-line2"} maxLength={150} value={values.line2} onChange={(v) => set("line2", v)} onBlur={() => blur(n("line2"))} error={errors[n("line2")]} /></div>
      <div className="cj-span-2"><TextField name={n("landmark")} label="Landmark" optional autoComplete="off" maxLength={150} value={values.landmark} onChange={(v) => set("landmark", v)} onBlur={() => blur(n("landmark"))} error={errors[n("landmark")]} /></div>
      <TextField name={n("city")} label="City" required autoComplete={prefix ? "off" : "address-level2"} maxLength={80} value={values.city} onChange={(v) => set("city", v)} onBlur={() => blur(n("city"))} error={errors[n("city")]} />
      <SelectField name={n("state")} label="State" required value={values.state} onChange={(v) => set("state", v)} onBlur={() => blur(n("state"))} options={states} error={errors[n("state")]} />
      <TextField name={n("pin")} label="PIN code" required type="tel" inputMode="numeric" autoComplete={prefix ? "off" : "postal-code"} maxLength={6} value={values.pin} onChange={(v) => set("pin", v)} onBlur={() => blur(n("pin"))} error={errors[n("pin")]} transform={(v) => v.replace(/\D/g, "").slice(0, 6)} hint="6 digits" />
      <TextField name={n("country")} label="Country" required readOnly value={values.country} onChange={() => {}} error={errors[n("country")]} hint="India only in this demo." />
    </div>
  );
}
