"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/Alert";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { formatDateTime } from "@/lib/format";
import { detailOf, type AdminJourneyDetail } from "@/lib/journey/admin-summary";
import { addOnPricePaise, DEMO_ADDONS } from "@/lib/journey/addons";
import { getAssetDetail } from "@/lib/journey/catalog";
import { STEPS } from "@/lib/journey/machine";
import { formatPaise, formatRupees } from "@/lib/journey/money";
import { createDemoProviders, integrationReadiness } from "@/lib/journey/providers";
import { getScheme } from "@/lib/journey/schemes";
import { OverallBadge, StepBadge } from "./JourneyBadges";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="fact"><dt>{label}</dt><dd>{children}</dd></div>;
}
const human = (s: string) => (s ? s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "-");

export function JourneyDetailClient({ reference }: { reference: string }) {
  const providers = useMemo(() => createDemoProviders(), []);
  const [state, setState] = useState<{ detail: AdminJourneyDetail | null; loaded: boolean }>({ detail: null, loaded: false });

  useEffect(() => {
    let live = true;
    providers.repository.loadApplication(reference).then(
      (d) => live && setState({ detail: d ? detailOf(d) : null, loaded: true }),
      () => live && setState({ detail: null, loaded: true }),
    );
    return () => { live = false; };
  }, [providers, reference]);

  const crumbs = [{ label: "Admin", href: "/admin" }, { label: "Customer journeys", href: "/admin/journeys" }, { label: reference }];
  if (!state.loaded) return <><PageHeader title={reference} crumbs={crumbs} /><p className="muted" role="status">Loading…</p></>;
  const dt = state.detail;
  if (!dt) {
    return (
      <>
        <PageHeader title={reference} crumbs={crumbs} />
        <section className="card"><EmptyState icon="search" title="Journey not found in this browser" action={<Link href="/admin/journeys" className="btn btn-secondary">Back to journeys</Link>}>Phase 1 journeys are stored in the browser that created them, and drafts are deleted after 7 days.</EmptyState></section>
      </>
    );
  }

  const asset = getAssetDetail(dt.asset);
  const scheme = getScheme(dt.scheme);
  const readiness = integrationReadiness(providers);

  return (
    <>
      <PageHeader
        title={reference}
        crumbs={crumbs}
        subtitle={`Created ${formatDateTime(dt.row.createdAt)} · updated ${formatDateTime(dt.row.updatedAt)}`}
        badge={<OverallBadge status={dt.row.overall} />}
        actions={<Link href="/admin/journeys" className="btn btn-secondary"><Icon name="chevronLeft" size={16} /> All journeys</Link>}
      />
      <Alert tone="warning">Demo draft stored in this browser. All verification results are simulated. Identity values are masked and no photo, document or PAN is stored.</Alert>

      <div className="jdetail-grid">
        <section className="card" aria-labelledby="steps-h">
          <div className="card-head"><h2 id="steps-h">Step by step</h2><span className="muted small">Current: {dt.row.currentStepLabel}</span></div>
          <div className="jtable-wrap">
            <table className="jtable-simple">
              <thead><tr><th scope="col">Step</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {STEPS.map((s) => (
                  <tr key={s.id}>
                    <td>{s.label}</td>
                    <td><StepBadge status={dt.row.steps[s.id]} />{dt.row.reviewFlags.filter((f) => f.step === s.id).map((f) => <div key={f.step} className="jflags">{f.reason}</div>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card" aria-labelledby="ready-h">
          <div className="card-head"><h2 id="ready-h">Integration readiness</h2></div>
          <div className="jtable-wrap">
            <table className="jtable-simple">
              <thead><tr><th scope="col">Integration</th><th scope="col">State</th></tr></thead>
              <tbody>
                {readiness.map((r) => (
                  <tr key={r.label}><td>{r.label}<div className="muted small">{r.meta.name}</div></td><td><span className={`jbadge ${r.ready ? "jbadge-completed" : "jbadge-review_required"}`}>{r.ready ? "Live" : `Demo adapter · ${r.phase}`}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card" aria-labelledby="basic-h">
          <div className="card-head"><h2 id="basic-h">Basic details</h2><StepBadge status={dt.row.steps.basic} /></div>
          <dl className="facts">
            <Fact label="Mobile (masked)">{dt.basic.mobile}</Fact>
            <Fact label="PAN (masked)">{dt.basic.panMasked}</Fact>
            <Fact label="Age">{dt.basic.ageYears === null ? "-" : `${dt.basic.ageYears} years`}</Fact>
            <Fact label="Mobile check">{human(dt.basic.mobileStatus)} (simulated)</Fact>
            <Fact label="PAN check">{human(dt.basic.panStatus)} (simulated)</Fact>
          </dl>
        </section>

        <section className="card" aria-labelledby="kyc-h">
          <div className="card-head"><h2 id="kyc-h">KYC</h2><StepBadge status={dt.row.steps.kyc} /></div>
          <dl className="facts">
            <Fact label="Status">{human(dt.kyc.status)}</Fact>
            <Fact label="Consent given">{dt.kyc.consent ? "Yes" : "No"}</Fact>
            <Fact label="Source">{dt.kyc.source}</Fact>
            <Fact label="Verified at">{dt.kyc.verifiedAt ? `${formatDateTime(dt.kyc.verifiedAt)} (demo)` : "-"}</Fact>
          </dl>
        </section>

        <section className="card" aria-labelledby="demo-h">
          <div className="card-head"><h2 id="demo-h">Demographic details</h2><StepBadge status={dt.row.steps.demographics} /></div>
          <dl className="facts">
            <Fact label="Applicant (masked)">{dt.demographics.applicant}</Fact>
            <Fact label="Email (masked)">{dt.demographics.email || "-"}</Fact>
            <Fact label="Requested amount">{dt.demographics.requestedAmountRupees === null ? "-" : formatRupees(dt.demographics.requestedAmountRupees)}</Fact>
            <Fact label="Employment">{human(dt.demographics.employmentType)}</Fact>
            <Fact label="Location">{[dt.demographics.city, dt.demographics.state, dt.demographics.pin].filter(Boolean).join(", ") || "-"}</Fact>
            <Fact label="Address matches document">{human(dt.demographics.matchesDocument)} (declared)</Fact>
            <Fact label="Delivery same as address">{human(dt.demographics.deliverySame)}</Fact>
            <Fact label="Sub-steps saved">{Object.values(dt.demographics.substeps).filter(Boolean).length} of 3</Fact>
          </dl>
        </section>

        <section className="card" aria-labelledby="live-h">
          <div className="card-head"><h2 id="live-h">Liveness</h2><StepBadge status={dt.row.steps.liveness} /></div>
          <dl className="facts">
            <Fact label="Consent given">{dt.liveness.consent ? "Yes" : "No"}</Fact>
            <Fact label="Capture">{dt.liveness.source === "camera" ? "Camera (photo not stored)" : dt.liveness.source === "placeholder" ? "Simulated placeholder" : "-"}</Fact>
            <Fact label="Demo outcome">{human(dt.liveness.outcome)}</Fact>
            <Fact label="Demo score">{dt.liveness.demoScorePct === undefined ? "-" : `${dt.liveness.demoScorePct}% (fixed demo value)`}</Fact>
          </dl>
        </section>

        <section className="card" aria-labelledby="offer-h">
          <div className="card-head"><h2 id="offer-h">Soft offer</h2><StepBadge status={dt.row.steps.offer} /></div>
          <dl className="facts">
            <Fact label="Status">{human(dt.offer.status)}</Fact>
            <Fact label="Indicative eligible">{dt.offer.eligibleAmountRupees === undefined ? "-" : `${formatRupees(dt.offer.eligibleAmountRupees)} (demo)`}</Fact>
            <Fact label="Illustrative EMI">{dt.offer.emiPaise === undefined ? "-" : `${formatPaise(dt.offer.emiPaise)} x ${dt.offer.tenureMonths}`}</Fact>
            <Fact label="Source">{dt.offer.source ?? "-"}</Fact>
          </dl>
        </section>

        <section className="card" aria-labelledby="asset-h">
          <div className="card-head"><h2 id="asset-h">Asset and scheme</h2><StepBadge status={dt.row.steps.asset} /></div>
          <dl className="facts">
            <Fact label="Product">{asset ? `${asset.manufacturerLabel} ${asset.modelLabel}, ${asset.variantLabel}` : "-"}</Fact>
            <Fact label="Category">{asset ? `${asset.category} / ${asset.subCategory}` : "-"}</Fact>
            <Fact label="Scheme">{scheme?.name ?? "-"}</Fact>
            <Fact label="Suspected activity">{human(dt.asset.suspectedActivity)}{dt.asset.suspectedActivity === "yes" ? " (review)" : ""}</Fact>
            <Fact label="Step-up preference">{human(dt.asset.stepUp)}</Fact>
          </dl>
        </section>

        <section className="card" aria-labelledby="addon-h">
          <div className="card-head"><h2 id="addon-h">Add-ons</h2><StepBadge status={dt.row.steps.addons} /></div>
          <dl className="facts">
            <Fact label="Confirmed">{dt.addonsConfirmed ? "Yes" : "No"}</Fact>
            {dt.addons.length === 0 ? <Fact label="Selected">{dt.addonsConfirmed ? "None" : "-"}</Fact> : dt.addons.map((a) => (
              <Fact key={a.id} label={DEMO_ADDONS.find((x) => x.id === a.id)?.name ?? a.id}>{formatPaise(addOnPricePaise(a.id, a.optionId) ?? 0)}</Fact>
            ))}
          </dl>
        </section>

        <section className="card" aria-labelledby="calc-h">
          <div className="card-head"><h2 id="calc-h">Final calculation</h2><StepBadge status={dt.row.steps.calculation} /></div>
          <dl className="facts">
            <Fact label="Confirmed">{dt.calculation.confirmed ? "Yes" : "No"}</Fact>
            <Fact label="Total financed">{dt.calculation.totalFinancedPaise === undefined ? "-" : `${formatPaise(dt.calculation.totalFinancedPaise)} (demo)`}</Fact>
            <Fact label="EMI">{dt.calculation.emiPaise === undefined ? "-" : `${formatPaise(dt.calculation.emiPaise)} x ${dt.calculation.tenureMonths}`}</Fact>
            <Fact label="Total payable">{dt.calculation.totalPayablePaise === undefined ? "-" : `${formatPaise(dt.calculation.totalPayablePaise)} (demo)`}</Fact>
          </dl>
        </section>
      </div>
    </>
  );
}
