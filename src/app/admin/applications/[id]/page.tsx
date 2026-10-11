import { notFound } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { StatusBadge } from "@/components/StatusBadge";
import { StatusForm } from "@/components/StatusForm";
import { getApplication, getHistory } from "@/lib/applications";
import { getDb } from "@/lib/db";
import { parseId } from "@/lib/http";
import { requireAdminPage } from "@/lib/page-auth";
import { TRANSITIONS } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage();
  const id = parseId((await params).id);
  if (id === null) notFound();
  const db = getDb();
  const app = await getApplication(db, id);
  if (!app) notFound();
  const history = await getHistory(db, id);

  return (
    <>
      <AdminNav user={user} />
      <h1>{app.reference} <StatusBadge status={app.status} /></h1>
      <p className="notice">Simulated record. Nothing here is a real KYC result or a loan decision.</p>

      <section className="card">
        <dl>
          <dt>Applicant (fictional)</dt><dd>{app.applicantName}</dd>
          <dt>Email (fictional)</dt><dd>{app.email}</dd>
          <dt>Loan product (demo)</dt><dd>{app.loanProduct}</dd>
          <dt>Requested amount</dt><dd>INR {app.requestedAmount.toLocaleString("en-IN")}</dd>
          <dt>Purpose</dt><dd>{app.purpose || "-"}</dd>
          <dt>Created</dt><dd>{app.createdAt}</dd>
        </dl>
      </section>

      <h2>Update status</h2>
      <section className="card">
        <StatusForm applicationId={app.id} options={[...TRANSITIONS[app.status]]} />
      </section>

      <h2>Status history</h2>
      <ol className="history">
        {history.map((h) => (
          <li key={h.id}>
            <div>
              {h.fromStatus ? <StatusBadge status={h.fromStatus} /> : <span className="muted">start</span>} {"->"}{" "}
              <StatusBadge status={h.toStatus} />
            </div>
            <div className="muted">{h.changedAt} by {h.changedBy}</div>
            {h.note && <div>{h.note}</div>}
          </li>
        ))}
      </ol>
    </>
  );
}
