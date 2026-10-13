"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useJourney } from "@/components/journey/JourneyProvider";
import { OfferDetails, OfferPending } from "@/components/journey/OfferViews";
import { DemoNotice, Notice } from "@/components/journey/Notices";
import { StepFrame } from "@/components/journey/StepFrame";
import { StepGate } from "@/components/journey/StepGate";
import { offerInputKey } from "@/lib/journey/machine";
import type { IndicativeOffer, JourneyDraft } from "@/lib/journey/types";

export default function OfferPage() {
  return <StepGate step="offer">{() => <Offer />}</StepGate>;
}

function Offer() {
  const router = useRouter();
  const { draft, update, providers } = useJourney();
  const d = draft as JourneyDraft;
  const key = offerInputKey(d);
  const fresh = d.offer.offer !== undefined && d.offer.inputKey === key;
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<"" | "integration">("");

  // Fetch (or refresh) the demo offer whenever there is none for the current answers.
  useEffect(() => {
    if (fresh) return;
    const { requestedAmount, monthlyIncome } = d.personal;
    if (requestedAmount === null || monthlyIncome === null) return;
    let live = true;
    (async () => {
      try {
        const r = await providers.offer.getIndicativeOffer({ requestedAmountRupees: requestedAmount, monthlyIncomeRupees: monthlyIncome });
        if (!live) return;
        if (r.status === "integration_required") {
          setPending("integration");
          return;
        }
        await update((x) => ({ ...x, offer: { inputKey: offerInputKey(x), offer: r, acknowledged: false, fetchedAt: new Date().toISOString() } }));
      } catch {
        if (live) setError("The demo offer could not be loaded. Try again.");
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, key, attempt]);

  const o: IndicativeOffer | undefined = fresh ? d.offer.offer : undefined;
  const usable = o && (o.status === "eligible" || o.status === "review_required");

  async function proceed() {
    await update((x) => ({ ...x, offer: { ...x.offer, acknowledged: true } }));
    router.push("/apply/asset-scheme");
  }

  return (
    <StepFrame
      step="offer"
      title="Soft Offer"
      subtitle="An indicative, illustrative offer. It is not a loan sanction."
      back={{ label: "Back", href: "/apply/liveness/result" }}
      primary={usable ? { label: "Continue", onClick: proceed } : undefined}
      secondary={o?.status === "not_eligible" ? { label: "Edit my details", href: "/apply/demographics/personal" } : undefined}
    >
      <DemoNotice>
        Every figure here is <strong>DEMO / INDICATIVE</strong> and comes from a fixture, not from a lender. No credit bureau was checked and nothing here is a
        sanction, approval or promise of a loan.
      </DemoNotice>

      {pending === "integration" && !o && <OfferPending reference={d.reference} />}

      {error && (
        <>
          <Notice tone="error">{error}</Notice>
          <div><button type="button" className="cj-btn cj-btn-secondary" onClick={() => { setError(""); setAttempt((a) => a + 1); }}><Icon name="refresh" size={18} />Try again</button></div>
        </>
      )}

      {!o && !error && pending === "" && (
        <div role="status" aria-busy="true"><p>Preparing your demo offer…</p><div className="skeleton skel-block" /></div>
      )}

      {o && <OfferDetails offer={o} reference={d.reference} />}
    </StepFrame>
  );
}
