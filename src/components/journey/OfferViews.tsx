import Link from "next/link";
import { Icon } from "@/components/Icon";
import { formatRupees } from "@/lib/journey/money";
import type { IndicativeOffer } from "@/lib/journey/types";
import { money, pct, Row } from "./MoneyRows";
import { Notice } from "./Notices";
import { offerStatusLabel } from "./StatusPill";

/** Shown when no offer service is connected. Nothing is assumed or invented. */
export function OfferPending({ reference }: { reference: string }) {
  return (
    <section className="cj-card cj-center" aria-labelledby="pending-title">
      <span className="cj-done-icon" aria-hidden="true"><Icon name="clock" size={30} /></span>
      <h2 id="pending-title">Offer integration pending</h2>
      <p className="cj-muted">No lender or offer service is connected, so no offer can be shown. Nothing has been assumed or invented. This step stays open until an offer integration is connected.</p>
      <dl className="cj-kv">
        <Row label="Application reference">{reference}</Row>
        <Row label="Assessment status">{offerStatusLabel("integration_required")}</Row>
      </dl>
    </section>
  );
}

/** The indicative offer for eligible, review-required and not-eligible results. Every figure is labelled DEMO/INDICATIVE. */
export function OfferDetails({ offer: o, reference }: { offer: IndicativeOffer; reference: string }) {
  return (
    <section className="cj-card" aria-labelledby="offer-title">
      <div className="cj-card-head">
        <h2 id="offer-title">Indicative offer <span className="cj-demo-tag">DEMO</span></h2>
        <span className={`cj-pill cj-pill-${o.status === "eligible" ? "in_progress" : o.status === "review_required" ? "review_required" : "failed"}`}>{offerStatusLabel(o.status)}</span>
      </div>
      <dl className="cj-kv">
        <Row label="Application reference">{reference}</Row>
        <Row label="Assessment status">{offerStatusLabel(o.status)}</Row>
        <Row label="Requested amount">{formatRupees(o.requestedAmountRupees)}</Row>
        <Row label={<>Indicative eligible amount <span className="cj-demo-tag">DEMO</span></>}>{o.status === "not_eligible" ? "Not available" : formatRupees(o.eligibleAmountRupees)}</Row>
        {o.status !== "not_eligible" && (
          <>
            <Row label="Illustrative interest rate">{pct(o.annualRateBps)}</Row>
            <Row label="Illustrative tenure">{o.tenureMonths} months</Row>
            <Row label="Illustrative EMI">{money(o.emiPaise)}</Row>
            <Row label="Indicative processing fee">{money(o.processingFeePaise)}</Row>
            <Row label="Applicable taxes (illustrative GST on the fee)">{money(o.taxOnFeesPaise)}</Row>
            <Row label="Illustrative total payable" kind="total">{money(o.totalPayablePaise)}</Row>
          </>
        )}
        <Row label="Offer expiry">Not available (a lender integration would provide it)</Row>
        <Row label="Source of figures">{o.source}</Row>
      </dl>
      {o.reasons.length > 0 && <Notice tone={o.status === "not_eligible" ? "error" : "warn"} title={o.status === "not_eligible" ? "Not eligible in this demo" : "Review required"}>{o.reasons.join(" ")}</Notice>}
      {o.status === "not_eligible" && <p className="cj-muted">Check the requested amount and income in <Link href="/apply/demographics/personal">your details</Link>. The offer refreshes when they change.</p>}
    </section>
  );
}
