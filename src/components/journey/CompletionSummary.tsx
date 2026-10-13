import type { JourneyDraft } from "@/lib/journey/types";
import { STEPS, type JourneyState } from "@/lib/journey/machine";
import { StepStatusPill } from "./StatusPill";
import { money, pct, Row } from "./MoneyRows";
import { formatRupees } from "@/lib/journey/money";
import { getScheme } from "@/lib/journey/schemes";

/** What is still simulated or unconnected. Shown on the completion screen and in the admin detail. */
export const OUTSTANDING_REQUIREMENTS = [
  "PAN verification: simulated in the form. A PAN authority integration is required.",
  "Mobile verification: no OTP or SMS provider is connected.",
  "Document retrieval: no DigiLocker (or similar) integration. No document was retrieved.",
  "Biometric liveness and face match: no authorized provider is connected. The result was a fixed demo value.",
  "Credit bureau and offer: no lender or bureau integration. The offer was a demo fixture.",
  "Product catalog and schemes: fictional demo data. A real catalog and lender schemes are required.",
  "Application storage: kept in this browser only. Server-side storage and checks are Phase 2 work.",
] as const;

export function CompletionSummary({ draft, journey }: { draft: JourneyDraft; journey: JourneyState }) {
  const offer = draft.offer.offer;
  const calc = draft.calculation.result;
  const scheme = getScheme(draft.schemeId);
  const reviews = STEPS.filter((s) => journey[s.id].status === "review_required");
  return (
    <>
      <section className="cj-card" aria-labelledby="steps-title">
        <h2 id="steps-title">Journey summary</h2>
        <ul className="cj-timeline-lite">
          {STEPS.map((s, i) => (
            <li key={s.id}><span>{i + 1}. {s.label}</span><StepStatusPill status={journey[s.id].status} /></li>
          ))}
        </ul>
        {reviews.length > 0 && (
          <ul className="cj-list" aria-label="Items marked for review">
            {reviews.map((s) => <li key={s.id}><strong>{s.label}:</strong> {journey[s.id].reasons[0] ?? "Marked for review."}</li>)}
          </ul>
        )}
      </section>

      {offer && (offer.status === "eligible" || offer.status === "review_required") && (
        <section className="cj-card" aria-labelledby="offer-title">
          <h2 id="offer-title">Illustrative offer <span className="cj-demo-tag">DEMO</span></h2>
          <dl className="cj-kv">
            <Row label="Indicative eligible amount">{formatRupees(offer.eligibleAmountRupees)}</Row>
            <Row label="Illustrative rate">{pct(offer.annualRateBps)}</Row>
            <Row label="Illustrative tenure">{offer.tenureMonths} months</Row>
            <Row label="Illustrative EMI">{money(offer.emiPaise)}</Row>
          </dl>
        </section>
      )}

      {calc && (
        <section className="cj-card" aria-labelledby="calc-title">
          <h2 id="calc-title">Final calculation <span className="cj-demo-tag">DEMO</span></h2>
          <dl className="cj-kv">
            <Row label="Scheme">{scheme?.name ?? "-"}</Row>
            <Row label="Total financed amount">{money(calc.financedAmountPaise)}</Row>
            <Row label="EMI (illustrative)">{money(calc.emiPaise)} x {calc.tenureMonths}</Row>
            <Row label="Total payable (illustrative)" kind="total">{money(calc.totalPayablePaise)}</Row>
          </dl>
        </section>
      )}

      <section className="cj-card" aria-labelledby="outstanding-title">
        <h2 id="outstanding-title">Still required before this could be real</h2>
        <ul className="cj-list">{OUTSTANDING_REQUIREMENTS.map((r) => <li key={r}>{r}</li>)}</ul>
      </section>
    </>
  );
}
