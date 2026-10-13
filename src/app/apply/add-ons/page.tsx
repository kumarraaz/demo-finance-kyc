"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { money, Row } from "@/components/journey/MoneyRows";
import { DemoNotice, Notice } from "@/components/journey/Notices";
import { useJourney } from "@/components/journey/JourneyProvider";
import { StepFrame } from "@/components/journey/StepFrame";
import { StepGate } from "@/components/journey/StepGate";
import { useStepForm } from "@/components/journey/useStepForm";
import { addOnPricePaise, addOnsSubtotalPaise, DEMO_ADDONS } from "@/lib/journey/addons";
import type { AddOnSelection, Errors, JourneyDraft } from "@/lib/journey/types";

export default function AddOnsPage() {
  return <StepGate step="addons">{(draft) => <AddOns initial={draft} />}</StepGate>;
}

type Form = { selected: AddOnSelection[] };
// Mandatory add-ons (none in the demo catalog) would have to be chosen; everything else is the person's choice.
const validate = (v: Form): Errors => {
  const e: Errors = {};
  for (const a of DEMO_ADDONS) if (a.requirement === "mandatory" && !v.selected.some((s) => s.id === a.id)) e[`addon-${a.id}`] = `${a.name} is required`;
  return e;
};

function AddOns({ initial }: { initial: JourneyDraft }) {
  const router = useRouter();
  const { update } = useJourney();
  const [busy, setBusy] = useState(false);
  const form = useStepForm<Form>({ selected: initial.addons.selected }, validate);
  const { values, set } = form;
  const subtotal = addOnsSubtotalPaise(values.selected);
  const find = (id: string) => values.selected.find((s) => s.id === id);

  const toggle = (id: string, defaultOption: string) =>
    set("selected", find(id) ? values.selected.filter((s) => s.id !== id) : [...values.selected, { id, optionId: defaultOption }]);
  const setOption = (id: string, optionId: string) => set("selected", values.selected.map((s) => (s.id === id ? { ...s, optionId } : s)));

  const persist = (confirmed: boolean) => update((d) => ({ ...d, addons: { selected: values.selected, confirmed } }));

  async function next() {
    if (!form.check()) return;
    setBusy(true);
    try {
      await persist(true);
      form.markSaved();
      router.push("/apply/calculation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepFrame
      step="addons"
      title="Add-on Product"
      subtitle="Optional extras. Nothing is selected for you."
      dirty={form.dirty}
      onSaveBeforeLeave={async () => { await persist(initial.addons.confirmed); }}
      back={{ label: "Back", onClick: async () => { await persist(initial.addons.confirmed); router.push("/apply/asset-scheme"); }, disabled: busy }}
      primary={{ label: values.selected.length === 0 ? "Continue without add-ons" : "Continue", onClick: next, busy, disabled: busy }}
      note={`Selected add-ons: ${money(subtotal)}`}
    >
      <DemoNotice>These add-ons and prices are <strong>fictional demo data</strong>. You can continue without choosing any.</DemoNotice>

      <ul className="cj-addon-grid" aria-label="Add-on products">
        {DEMO_ADDONS.map((a) => {
          const sel = find(a.id);
          const price = sel ? addOnPricePaise(a.id, sel.optionId) : a.options[0].pricePaise;
          return (
            <li key={a.id} className={`cj-option${sel ? " is-selected" : ""}`}>
              <div className="cj-option-head">
                <h2 className="cj-addon-title">{a.name}</h2>
                <span className={`cj-pill cj-pill-${a.requirement === "mandatory" ? "review_required" : "pending"}`}>{a.requirement === "mandatory" ? "Mandatory" : "Optional"}</span>
              </div>
              <p className="cj-muted">{a.description}</p>
              {a.options.length > 1 && (
                <fieldset className="cj-fieldset" disabled={!sel}>
                  <legend className="cj-label">Coverage period</legend>
                  <div className="cj-radios cj-radios-row">
                    {a.options.map((o) => (
                      <label key={o.id} className={`cj-radio${sel?.optionId === o.id ? " is-checked" : ""}`}>
                        <input type="radio" name={`opt-${a.id}`} checked={sel?.optionId === o.id} onChange={() => setOption(a.id, o.id)} />
                        <span>{o.label}<span className="cj-radio-hint">{money(o.pricePaise)}</span></span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <p className="cj-option-price">{money(price ?? 0)} <span className="cj-demo-tag">DEMO</span></p>
              <p className="cj-hint">{a.exclusions}</p>
              <button
                type="button"
                className={`cj-btn ${sel ? "cj-btn-secondary" : "cj-btn-primary"}`}
                aria-pressed={Boolean(sel)}
                onClick={() => toggle(a.id, a.options[0].id)}
              >
                {sel ? `Remove ${a.name}` : `Add ${a.name}`}
              </button>
              {form.errors[`addon-${a.id}`] && <p className="cj-error" role="alert">{form.errors[`addon-${a.id}`]}</p>}
            </li>
          );
        })}
      </ul>

      <section className="cj-card" aria-labelledby="sum-title" aria-live="polite">
        <h2 id="sum-title">Selected add-ons</h2>
        {values.selected.length === 0 ? (
          <p className="cj-muted">None selected.</p>
        ) : (
          <dl className="cj-kv">
            {values.selected.map((s) => {
              const a = DEMO_ADDONS.find((x) => x.id === s.id)!;
              const opt = a.options.find((o) => o.id === s.optionId);
              return <Row key={s.id} label={`${a.name}${opt ? `, ${opt.label}` : ""}`}>{money(addOnPricePaise(s.id, s.optionId) ?? 0)}</Row>;
            })}
          </dl>
        )}
        <dl className="cj-kv"><Row label="Subtotal (illustrative)" kind="total">{money(subtotal)}</Row></dl>
        <Notice tone="info" title="Exclusions and taxes">
          Prices are illustrative and may exclude taxes and charges a real provider would apply. Each plan has exclusions; the text on each card is placeholder wording, not a policy.
        </Notice>
      </section>
    </StepFrame>
  );
}
