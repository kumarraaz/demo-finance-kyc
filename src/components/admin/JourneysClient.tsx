"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { formatDateTime } from "@/lib/format";
import { matchesFilters, NO_FILTERS, summarizeDraft, type AdminFilters, type AdminJourneyRow } from "@/lib/journey/admin-summary";
import { STEPS } from "@/lib/journey/machine";
import { createDemoProviders } from "@/lib/journey/providers";
import { Alert } from "@/components/Alert";
import { Icon } from "@/components/Icon";
import { OVERALL_TEXT, OverallBadge, StepStrip } from "./JourneyBadges";

const OVERALL_OPTIONS = Object.entries(OVERALL_TEXT) as [AdminFilters["overall"], string][];

export function JourneysClient() {
  const [rows, setRows] = useState<AdminJourneyRow[] | null>(null);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState<AdminFilters>(NO_FILTERS);

  useEffect(() => {
    let live = true;
    createDemoProviders().repository.listDrafts().then(
      (drafts) => live && setRows(drafts.map((d) => summarizeDraft(d))),
      () => live && setError(true),
    );
    return () => { live = false; };
  }, []);

  const shown = useMemo(() => (rows ?? []).filter((r) => matchesFilters(r, filters)), [rows, filters]);
  const set = <K extends keyof AdminFilters>(k: K, v: AdminFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  return (
    <>
      <Alert tone="info" title="Where this data comes from">
        In Phase 1 a customer&apos;s journey is saved in <strong>their own browser</strong>. This page lists the demo drafts stored in <strong>this browser only</strong>.
        Journeys started on other devices cannot be seen here until Phase 2 adds server-side storage.
      </Alert>

      <section className="card" aria-label="Customer journeys">
        <form className="jfilters" role="search" aria-label="Filter journeys" onSubmit={(e) => e.preventDefault()}>
          <div className="field">
            <label htmlFor="jq">Application reference</label>
            <input id="jq" className="input" type="search" placeholder="DFK-…" value={filters.q} onChange={(e) => set("q", e.target.value)} maxLength={40} />
          </div>
          <div className="field">
            <label htmlFor="jstatus">Status</label>
            <select id="jstatus" className="select" value={filters.overall} onChange={(e) => set("overall", e.target.value as AdminFilters["overall"])}>
              <option value="">All statuses</option>
              {OVERALL_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="jstep">Current step</label>
            <select id="jstep" className="select" value={filters.step} onChange={(e) => set("step", e.target.value as AdminFilters["step"])}>
              <option value="">All steps</option>
              {STEPS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              <option value="done">All steps passed</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="jfrom">Created from</label>
            <input id="jfrom" className="input" type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="jto">Created to</label>
            <input id="jto" className="input" type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} />
          </div>
          {filtered && <button type="button" className="btn btn-secondary" onClick={() => setFilters(NO_FILTERS)}>Clear</button>}
        </form>

        {error && <EmptyState icon="alert" title="Could not read this browser's drafts">Browser storage may be blocked. Allow storage for this site and reload.</EmptyState>}
        {!error && rows === null && <p className="muted" role="status">Loading…</p>}
        {!error && rows !== null && shown.length === 0 && (
          rows.length === 0
            ? <EmptyState icon="inbox" title="No journeys in this browser" action={<Link href="/apply" className="btn btn-primary"><Icon name="plus" size={18} /> Start a demo application</Link>}>Complete or start a demo application in this browser to see it here.</EmptyState>
            : <EmptyState icon="search" title="No journeys match these filters" action={<button type="button" className="btn btn-secondary" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>}>Try different filters.</EmptyState>
        )}
        {!error && shown.length > 0 && (
          <div className="table-wrap">
            <table className="table table-wide">
              <caption className="sr-only">Customer journeys (demo drafts in this browser)</caption>
              <thead>
                <tr>
                  <th scope="col">Reference</th><th scope="col">Applicant</th><th scope="col">Created / updated</th>
                  <th scope="col">Current step</th><th scope="col">Status</th><th scope="col">Steps</th><th scope="col"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.reference}>
                    <td data-label="Reference" className="cell-ref"><Link href={`/admin/journeys/${r.reference}`}>{r.reference}</Link></td>
                    <td data-label="Applicant">{r.applicant}</td>
                    <td data-label="Created / updated" className="cell-date">
                      <div className="cell-person">
                        <span className="cell-date-line">{formatDateTime(r.createdAt)}</span>
                        <span className="cell-date-line cell-sub">updated {formatDateTime(r.updatedAt)}</span>
                      </div>
                    </td>
                    <td data-label="Current step">
                      {r.currentStepLabel}
                      {r.reviewFlags.length > 0 && <ul className="jflags" aria-label="Review required">{r.reviewFlags.map((f) => <li key={f.step}>Review: {f.label}</li>)}</ul>}
                    </td>
                    <td data-label="Status"><OverallBadge status={r.overall} /></td>
                    <td data-label="Steps"><StepStrip steps={r.steps} /></td>
                    <td data-label="Action"><Link href={`/admin/journeys/${r.reference}`} className="btn btn-secondary btn-sm" aria-label={`Open journey ${r.reference}`}>Open<Icon name="arrowRight" size={16} /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
