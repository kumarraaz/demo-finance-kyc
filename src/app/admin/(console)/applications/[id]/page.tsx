import { notFound } from "next/navigation";
import { Alert } from "@/components/Alert";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { StatusForm } from "@/components/StatusForm";
import { StatusTimeline } from "@/components/StatusTimeline";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { getApplication, getHistory } from "@/lib/applications";
import { getDb } from "@/lib/db";
import { formatDateTime, formatInr, formatProduct } from "@/lib/format";
import { parseId } from "@/lib/http";
import { requireAdminPage } from "@/lib/page-auth";
import { TRANSITIONS } from "@/lib/status";

export const dynamic = "force-dynamic";

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`fact${className ? ` ${className}` : ""}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const id = parseId((await params).id);
  if (id === null) notFound();
  const db = getDb();
  const app = await getApplication(db, id);
  if (!app) notFound();
  const history = await getHistory(db, id);

  return (
    <>
      <PageHeader
        title={app.reference}
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Applications", href: "/admin/applications" }, { label: app.reference }]}
        subtitle={`Created ${formatDateTime(app.createdAt)}`}
        badge={<StatusBadge status={app.status} />}
      />

      <Alert tone="warning">Simulated record. Nothing here is a real KYC result or a loan decision.</Alert>

      <div className="detail-grid">
        <div className="stack">
          <section className="card" aria-labelledby="summary-title">
            <div className="card-head"><h2 id="summary-title">Application summary</h2></div>
            <dl className="facts">
              <p className="fact-group-title">Applicant (fictional)</p>
              <Fact label="Name">{app.applicantName}</Fact>
              <Fact label="Email">{app.email}</Fact>
              <p className="fact-group-title">Loan request (demo)</p>
              <Fact label="Loan product">{formatProduct(app.loanProduct)}</Fact>
              <Fact label="Requested amount" className="fact-amount">{formatInr(app.requestedAmount)}</Fact>
              <Fact label="Purpose">{app.purpose || "-"}</Fact>
              <p className="fact-group-title">Record</p>
              <Fact label="Reference">{app.reference}</Fact>
              <Fact label="Created">{formatDateTime(app.createdAt)}</Fact>
              <Fact label="Last updated">{formatDateTime(app.updatedAt)}</Fact>
            </dl>
          </section>
          <WorkflowPanel current={app.status} />
        </div>

        <div className="stack">
          <section className="card" aria-labelledby="update-title">
            <div className="card-head"><h2 id="update-title">Update status</h2></div>
            <div className="card-body">
              <StatusForm applicationId={app.id} options={[...TRANSITIONS[app.status]]} />
            </div>
          </section>

          <section className="card" aria-labelledby="history-title">
            <div className="card-head">
              <h2 id="history-title">Status history</h2>
              <span className="muted small">{history.length} {history.length === 1 ? "entry" : "entries"}</span>
            </div>
            <div className="card-body">
              <StatusTimeline history={history} />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
