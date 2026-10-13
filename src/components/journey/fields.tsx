"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { fieldId } from "./useStepForm";

type AriaProps = { id: string; "aria-describedby"?: string; "aria-invalid"?: true; "aria-required"?: true };

/** Label above the control, required marker, helper text and an error tied to the control by aria-describedby. */
export function Field({
  name, label, required, optional, hint, error, children,
}: {
  name: string; label: string; required?: boolean; optional?: boolean; hint?: string; error?: string;
  children: (aria: AriaProps) => ReactNode;
}) {
  const id = fieldId(name);
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-err` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="cj-field">
      <label htmlFor={id} className="cj-label">
        {label}
        {required && <span className="cj-req" aria-hidden="true"> *</span>}
        {required && <span className="sr-only"> (required)</span>}
        {optional && <span className="cj-opt">Optional</span>}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, "aria-required": required ? true : undefined })}
      {hint && <p id={`${id}-hint`} className="cj-hint">{hint}</p>}
      {error && (
        <p id={`${id}-err`} className="cj-error" role="alert">
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}
    </div>
  );
}

type TextProps = {
  name: string; label: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  required?: boolean; optional?: boolean; hint?: string; error?: string; type?: "text" | "email" | "tel" | "date";
  inputMode?: "text" | "numeric" | "email" | "tel" | "decimal"; autoComplete?: string; maxLength?: number; placeholder?: string;
  min?: string; max?: string; readOnly?: boolean; disabled?: boolean; transform?: (v: string) => string; spellCheck?: boolean;
};

export function TextField({ name, label, value, onChange, onBlur, required, optional, hint, error, type = "text", transform, ...rest }: TextProps) {
  return (
    <Field name={name} label={label} required={required} optional={optional} hint={hint} error={error}>
      {(aria) => (
        <input
          {...aria}
          name={name}
          className="cj-input"
          type={type}
          value={value}
          onChange={(e) => onChange(transform ? transform(e.target.value) : e.target.value)}
          onBlur={onBlur}
          {...rest}
        />
      )}
    </Field>
  );
}

/** Whole-rupee amount. Shows the amount in Indian grouping underneath as you type. */
export function CurrencyField({
  name, label, value, onChange, onBlur, required, hint, error, formatted,
}: {
  name: string; label: string; value: number | null; onChange: (v: number | null) => void; onBlur?: () => void;
  required?: boolean; hint?: string; error?: string; formatted: (n: number) => string;
}) {
  return (
    <Field name={name} label={label} required={required} hint={hint ?? (value ? formatted(value) : undefined)} error={error}>
      {(aria) => (
        <div className="cj-money">
          <span aria-hidden="true">₹</span>
          <input
            {...aria}
            name={name}
            className="cj-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={value === null ? "" : String(value)}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
              onChange(digits === "" ? null : Number(digits));
            }}
            onBlur={onBlur}
          />
        </div>
      )}
    </Field>
  );
}

export function SelectField({
  name, label, value, onChange, onBlur, options, required, optional, hint, error, placeholder = "Select", disabled,
}: {
  name: string; label: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  options: readonly { value: string; label: string }[]; required?: boolean; optional?: boolean; hint?: string; error?: string;
  placeholder?: string; disabled?: boolean;
}) {
  return (
    <Field name={name} label={label} required={required} optional={optional} hint={hint} error={error}>
      {(aria) => (
        <select {...aria} name={name} className="cj-input cj-select" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} disabled={disabled}>
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** A radio group is a fieldset with a legend, so screen readers announce the question with every option. */
export function RadioGroup({
  name, legend, value, onChange, onBlur, options, required, hint, error, layout = "row",
}: {
  name: string; legend: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  options: readonly { value: string; label: string; hint?: string }[]; required?: boolean; hint?: string; error?: string; layout?: "row" | "stack";
}) {
  const id = fieldId(name);
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-err` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset className="cj-fieldset" aria-describedby={describedBy} aria-required={required ? true : undefined}>
      <legend className="cj-label">
        {legend}
        {required && <span className="cj-req" aria-hidden="true"> *</span>}
        {required && <span className="sr-only"> (required)</span>}
      </legend>
      <div className={`cj-radios cj-radios-${layout}`}>
        {options.map((o, i) => (
          <label key={o.value} className={`cj-radio${value === o.value ? " is-checked" : ""}`}>
            <input
              id={i === 0 ? id : `${id}-${i}`}
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              onBlur={onBlur}
            />
            <span>
              {o.label}
              {o.hint && <span className="cj-radio-hint">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
      {hint && <p id={`${id}-hint`} className="cj-hint">{hint}</p>}
      {error && (
        <p id={`${id}-err`} className="cj-error" role="alert">
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function CheckboxField({
  name, label, checked, onChange, onBlur, required, error, hint,
}: {
  name: string; label: ReactNode; checked: boolean; onChange: (v: boolean) => void; onBlur?: () => void; required?: boolean; error?: string; hint?: string;
}) {
  const id = fieldId(name);
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-err` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="cj-field">
      <label className="cj-check" htmlFor={id}>
        <input id={id} name={name} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} onBlur={onBlur} aria-describedby={describedBy} aria-invalid={error ? true : undefined} aria-required={required ? true : undefined} />
        <span>
          {label}
          {required && <span className="sr-only"> (required)</span>}
        </span>
      </label>
      {hint && <p id={`${id}-hint`} className="cj-hint">{hint}</p>}
      {error && (
        <p id={`${id}-err`} className="cj-error" role="alert">
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}
    </div>
  );
}

/** One-line summary of what is wrong after a failed submit, announced to screen readers. */
export function FormAlert({ count, extra }: { count: number; extra?: string }) {
  if (count === 0 && !extra) return null;
  return (
    <div className="cj-alert cj-alert-error" role="alert">
      <Icon name="alert" size={18} />
      <div>
        {count > 0 && <strong>{count === 1 ? "Please fix 1 field below." : `Please fix ${count} fields below.`}</strong>}
        {extra && <span className="cj-block">{extra}</span>}
      </div>
    </div>
  );
}
