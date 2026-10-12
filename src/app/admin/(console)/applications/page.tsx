import Link from "next/link";
import { ApplicationsTable } from "@/components/ApplicationsTable";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { listApplications } from "@/lib/applications";
import { getDb } from "@/lib/db";
import { parseListSearchParams } from "@/lib/list-query";
import { requireAdminPage } from "@/lib/page-auth";
import { STATUSES, STATUS_LABELS } from "@/lib/status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Applications | Demo Finance KYC (simulated)" };

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  // Bad or blank query values fall back to defaults instead of erroring the page.
  const query = parseListSearchParams(await searchParams);

  const { items, total } = await listApplications(getDb(), query);
  const pages = Math.max(1, Math.ceil(total / query.pageSize));
  const link = (page: number) => {
    const p = new URLSearchParams();
    if (query.status) p.set("status", query.status);
    if (query.q) p.set("q", query.q);
    p.set("page", String(page));
    return `/admin/applications?${p}`;
  };
  const filtered = Boolean(query.q || query.status);

  return (
    <>
      <PageHeader
        title="Applications"
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Applications" }]}
        subtitle="Search by name, email or reference, or filter by status."
        badge={<span className="sim-tag">SIMULATED DATA</span>}
        actions={
          <Link href="/admin/applications/new" className="btn btn-primary">
            <Icon name="plus" size={18} /> New demo application
          </Link>
        }
      />

      <section className="card" aria-label="Application list">
        <form method="get" action="/admin/applications" className="toolbar" role="search">
          <div className="toolbar-fields">
            <div className="field">
              <label htmlFor="q">Search</label>
              <input id="q" name="q" type="search" className="input" placeholder="Name, email or reference" defaultValue={query.q ?? ""} maxLength={100} />
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" className="select" defaultValue={query.status ?? ""}>
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="toolbar-actions">
            <button type="submit" className="btn btn-primary">Apply filters</button>
            {filtered && <Link href="/admin/applications" className="btn btn-secondary">Clear</Link>}
          </div>
        </form>

        {items.length === 0 ? (
          filtered ? (
            <EmptyState icon="search" title="No applications match" action={<Link href="/admin/applications" className="btn btn-secondary">Clear filters</Link>}>
              Try a different search term or status.
            </EmptyState>
          ) : (
            <EmptyState
              icon="inbox"
              title="No applications yet"
              action={
                <Link href="/admin/applications/new" className="btn btn-primary">
                  <Icon name="plus" size={18} /> Create a demo application
                </Link>
              }
            >
              Create a fictional application to get started.
            </EmptyState>
          )
        ) : (
          <ApplicationsTable items={items} />
        )}

        <nav className="pager" aria-label="Pagination">
          <span>
            Page {query.page} of {pages} &middot; {total} {total === 1 ? "result" : "results"}
          </span>
          <span className="pager-links">
            {query.page > 1 ? (
              <Link href={link(query.page - 1)} className="btn btn-secondary btn-sm" rel="prev">
                <Icon name="chevronLeft" size={16} /> Previous
              </Link>
            ) : null}
            {query.page < pages ? (
              <Link href={link(query.page + 1)} className="btn btn-secondary btn-sm" rel="next">
                Next <Icon name="chevronRight" size={16} />
              </Link>
            ) : null}
          </span>
        </nav>
      </section>
    </>
  );
}
