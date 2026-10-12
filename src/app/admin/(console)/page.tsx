import Link from "next/link";
import { ApplicationsTable } from "@/components/ApplicationsTable";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { KpiCards, StatusDistribution } from "@/components/StatusOverview";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { listApplications, statusCounts } from "@/lib/applications";
import { getDb } from "@/lib/db";
import { requireAdminPage } from "@/lib/page-auth";
import { listQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const RECENT = 5;

export default async function Overview() {
  await requireAdminPage();

  const db = getDb();
  const [counts, { items }] = await Promise.all([
    statusCounts(db),
    listApplications(db, listQuerySchema.parse({ pageSize: RECENT })),
  ]);

  return (
    <>
      <PageHeader
        title="Overview"
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Overview" }]}
        subtitle="Live counts from the application database. All records and verification outcomes are simulated."
        badge={<span className="sim-tag">SIMULATED DATA</span>}
        actions={
          <Link href="/admin/applications/new" className="btn btn-primary">
            <Icon name="plus" size={18} /> New demo application
          </Link>
        }
      />

      <KpiCards counts={counts} />

      {counts.total > 0 && (
        <section className="card" aria-labelledby="dist-title">
          <div className="card-head"><h2 id="dist-title">Status distribution</h2></div>
          <div className="card-body"><StatusDistribution counts={counts} /></div>
        </section>
      )}

      <section className="card" aria-labelledby="recent-title">
        <div className="card-head">
          <h2 id="recent-title">Recent applications</h2>
          {counts.total > 0 && (
            <Link href="/admin/applications" className="btn btn-secondary btn-sm">
              View all {counts.total} <Icon name="arrowRight" size={16} />
            </Link>
          )}
        </div>
        {items.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="No applications yet"
            action={
              <Link href="/admin/applications/new" className="btn btn-primary">
                <Icon name="plus" size={18} /> Create a demo application
              </Link>
            }
          >
            Create a fictional application to see it counted and tracked here.
          </EmptyState>
        ) : (
          <ApplicationsTable items={items} />
        )}
      </section>

      <WorkflowPanel />
    </>
  );
}
