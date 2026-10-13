"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CALCULATION_ASSUMPTIONS, CalculationTable } from "@/components/journey/CalculationTable";
import { useJourney } from "@/components/journey/JourneyProvider";
import { DemoNotice, Notice } from "@/components/journey/Notices";
import { StepFrame } from "@/components/journey/StepFrame";
import { StepGate } from "@/components/journey/StepGate";
import { Icon } from "@/components/Icon";
import { DEMO_ADDONS, addOnPricePaise } from "@/lib/journey/addons";
import { getAssetDetail } from "@/lib/journey/catalog";
import { buildCalculation } from "@/lib/journey/final";
import { getScheme } from "@/lib/journey/schemes";
import { formatRupees } from "@/lib/journey/money";
import type { JourneyDraft } from "@/lib/journey/types";

export default function CalculationPage() {
  return <StepGate step="calculation">{() => <Calculation />}</StepGate>;
}

function Calculation() {
  const router = useRouter();
  const { draft, update, providers } = useJourney();
  const d = draft as JourneyDraft;
  const [busy, setBusy] = useState<"" | "recalc" | "done">("");
  const [live, setLive] = useState("");

  // Pure function of the saved answers: opening this screen changes nothing.
  const built = useMemo(() => buildCalculation(d, providers.rules), [d, providers.rules]);
  const asset = getAssetDetail(d.asset);
  const scheme = getScheme(d.schemeId);
  const eligible = d.offer.offer && d.offer.offer.status !== "not_eligible" ? d.offer.offer.eligibleAmountRupees : null;

  async function recalc() {
    if (!built.ok) return;
    setBusy("recalc");
    try {
      const r = buildCalculation(d, providers.rules);
      if (r.ok) await update((x) => ({ ...x, calculation: { result: r.result, confirmedAt: undefined } }));
      setLive("Recalculated from your current selections.");
    } finally {
      setBusy("");
    }
  }

  async function complete() {
    if (!built.ok) return;
    setBusy("done");
    try {
      const r = buildCalculation(d, providers.rules);
      if (!r.ok) return;
      const t = new Date().toISOString();
      await update((x) => ({ ...x, calculation: { result: r.result, confirmedAt: t }, completedAt: t }));
      router.push("/apply/complete");
    } finally {
      setBusy("");
    }
  }

  const financed = built.ok ? built.result.financedAmountPaise : 0;
  const aboveEligible = built.ok && eligible !== null && financed > eligible * 100;

  return (
    <StepFrame
      step="calculation"
      title="Final Calculation Display"
      subtitle="An itemised, illustrative breakdown. These are estimates, not lender terms."
      back={{ label: "Back to edit selections", href: "/apply/add-ons" }}
      secondary={built.ok ? { label: "Recalculate", onClick: recalc, busy: busy === "recalc", disabled: busy !== "", icon: <Icon name="refresh" size={18} /> } : undefined}
      primary={built.ok ? { label: "Complete Demo Journey", onClick: complete, busy: busy === "done", disabled: busy !== "" } : undefined}
    >
      <DemoNotice>
        All amounts are <strong>illustrative estimates</strong> from demo fixtures. Final amounts may differ after an authorized lender&apos;s assessment. This is not a
        loan agreement, mandate, signature or disbursement.
      </DemoNotice>

      {!built.ok && (
        <section className="cj-card" aria-labelledby="missing-title">
          <h2 id="missing-title">Some details are missing</h2>
          <p className="cj-muted">The calculation needs the items below. Nothing has been assumed for you.</p>
          <ul className="cj-list">
            {built.missing.map((m) => (
              <li key={m.message}>{m.message} <Link href={m.path}>Go to this step</Link></li>
            ))}
          </ul>
        </section>
      )}

      {built.ok && asset && scheme && (
        <section className="cj-card" aria-labelledby="calc-title">
          <div className="cj-card-head">
            <h2 id="calc-title">Your illustrative breakdown <span className="cj-demo-tag">DEMO</span></h2>
            <span className="cj-muted small">Reference {d.reference}</span>
          </div>
          <CalculationTable
            calc={built.result}
            schemeName={scheme.name}
            assetLabel={`${asset.manufacturerLabel} ${asset.modelLabel}, ${asset.variantLabel}`}
            requestedRupees={d.personal.requestedAmount}
            eligibleRupees={eligible}
            addOns={d.addons.selected.map((s) => ({ label: `${DEMO_ADDONS.find((a) => a.id === s.id)?.name ?? s.id}`, paise: addOnPricePaise(s.id, s.optionId) ?? 0 }))}
          />
          {aboveEligible && (
            <Notice tone="warn" title="Above the indicative eligible amount">
              The financed amount is higher than the demo indicative eligible amount of {formatRupees(eligible!)}. A reviewer would decide. This does not reject the application.
            </Notice>
          )}
          <p className="sr-only" role="status" aria-live="polite">{live}</p>
        </section>
      )}

      <section className="cj-card" aria-labelledby="assume-title">
        <h2 id="assume-title">Assumptions</h2>
        <ul className="cj-list">
          {CALCULATION_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}
        </ul>
      </section>
    </StepFrame>
  );
}
