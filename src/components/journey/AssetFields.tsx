"use client";

import { RadioGroup, SelectField, TextField } from "./fields";
import { useJourney } from "./JourneyProvider";
import { useCatalog } from "./useCatalog";
import { selectLevel } from "@/lib/journey/catalog";
import { formatPaise } from "@/lib/journey/money";
import type { AssetSelection, Errors } from "@/lib/journey/types";
import { Notice } from "./Notices";

const YES_NO = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] as const;

/** Product, manufacturer, model and variant (dependent), the derived category, and the two explicit Yes/No questions. */
export function AssetFields({
  values, onChange, errors, blur, showDeclarations = true,
}: {
  values: AssetSelection; onChange: (v: AssetSelection) => void; errors: Errors; blur: (name: string) => void; showDeclarations?: boolean;
}) {
  const { providers } = useJourney();
  const cat = useCatalog(providers.catalog, values);
  const opts = (l: { id: string; label: string }[]) => l.map((o) => ({ value: o.id, label: o.label }));
  const change = (level: "productType" | "manufacturer" | "model" | "variant", value: string) => onChange({ ...values, ...selectLevel(values, level, value) });

  return (
    <>
      {cat.failed && <Notice tone="error">The demo catalog could not be loaded. Reload the page and try again.</Notice>}
      <div className="cj-grid cj-grid-2">
        <SelectField name="productType" label="Product type" required value={values.productType} onChange={(v) => change("productType", v)} onBlur={() => blur("productType")} options={opts(cat.types)} error={errors.productType} />
        <SelectField name="manufacturer" label="Manufacturer" required value={values.manufacturer} onChange={(v) => change("manufacturer", v)} onBlur={() => blur("manufacturer")} options={opts(cat.manufacturers)} disabled={!values.productType} error={errors.manufacturer} placeholder={values.productType ? "Select" : "Choose a product type first"} />
        <SelectField name="model" label="Model" required value={values.model} onChange={(v) => change("model", v)} onBlur={() => blur("model")} options={opts(cat.models)} disabled={!values.manufacturer} error={errors.model} placeholder={values.manufacturer ? "Select" : "Choose a manufacturer first"} />
        <SelectField
          name="variant" label="Variant" required value={values.variant} onChange={(v) => change("variant", v)} onBlur={() => blur("variant")}
          options={cat.variants.map((v) => ({ value: v.id, label: `${v.label} · ${formatPaise(v.pricePaise, { decimals: false })}` }))}
          disabled={!values.model} error={errors.variant} placeholder={values.model ? "Select" : "Choose a model first"}
        />
        <TextField name="category" label="Category of asset" value={cat.detail?.category ?? ""} onChange={() => {}} readOnly placeholder="Filled in from your selection" hint="Derived from the demo catalog." />
        <TextField name="subCategory" label="Sub-category of asset" value={cat.detail?.subCategory ?? ""} onChange={() => {}} readOnly placeholder="Filled in from your selection" hint="Derived from the demo catalog." />
      </div>
      {showDeclarations && (
        <div className="cj-grid">
          <RadioGroup
            name="suspectedActivity" legend="Suspected activity?" required value={values.suspectedActivity} options={YES_NO}
            onChange={(v) => onChange({ ...values, suspectedActivity: v as "yes" | "no" })} onBlur={() => blur("suspectedActivity")} error={errors.suspectedActivity}
            hint="Answering Yes does not reject the application. It is marked for review."
          />
          <RadioGroup
            name="stepUp" legend="Do you want to apply for Step-up Schemes?" required value={values.stepUp} options={YES_NO}
            onChange={(v) => onChange({ ...values, stepUp: v as "yes" | "no" })} onBlur={() => blur("stepUp")} error={errors.stepUp}
            hint="You must choose Yes or No. Nothing is selected for you."
          />
        </div>
      )}
    </>
  );
}
