import Link from "next/link";
import { AdminNav } from "@/components/AdminNav";
import { StatusBadge } from "@/components/StatusBadge";
import { listApplications, statusCounts } from "@/lib/applications";
import { getDb } from "@/lib/db";
import { requireAdminPage } from "@/lib/page-auth";
import { STATUSES, STATUS_LABELS } from "@/lib/status";
import { listQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAdminPage();
  const raw = await searchParams;
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  // Bad query values fall back to defaults instead of erroring the page.
  const parsed = listQuerySchema.safeParse(flat);
  const query = parsed.success ? parsed.data : listQuerySchema.parse({});

  const db = getDb();
  const counts = statusCounts(db);
  const { items, total } = listApplications(db, query);
  const pages = Math.max(1, Math.ceil(total / query.pageSize));
  const link = (page: number) => {
    const p = new URLSearchParams();
    if (query.status) p.set("status", query.status);
    if (query.q) p.set("q", query.q);
    p.set("page", String(page));
    return `/admin?${p}`;
  };

  return (
    <>
      <AdminNav user={user} />
      <h1>Applications <span className="sim-tag">SIMULATED DATA</span></h1>

      <section className="counts" aria-label="Counts by status">
        <div className="count"><span className="n">{counts.total}</span> total</div>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin?status=${s}`} className="count">
            <span className="n">{counts[s]}</span> {STATUS_LABELS[s]}
          </Link>
        ))}
      </section>

      <form method="get" className="filters">
        <input name="q" placeholder="Search name, email or reference" defaultValue={query.q ?? ""} maxLength={100} />
        <select name="status" defaultValue={query.status ?? ""}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <button type="submit">Filter</button>
      </form>

      {items.length === 0 ? (
        <p className="muted">No applications match. <Link href="/admin/applications/new">Create a demo application</Link>.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Reference</th><th>Applicant</th><th>Product</th><th>Amount (INR)</th><th>Status</th><th>Updated</th></tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td><Link href={`/admin/applications/${a.id}`}>{a.reference}</Link></td>
                <td>{a.applicantName}</td>
                <td>{a.loanProduct}</td>
                <td>{a.requestedAmount.toLocaleString("en-IN")}</td>
                <td><StatusBadge status={a.status} /></td>
                <td>{a.updatedAt.slice(0, 16).replace("T", " ")} UTC</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="pager">
        Page {query.page} of {pages} ({total} results){" "}
        {query.page > 1 && <Link href={link(query.page - 1)}>Previous</Link>}{" "}
        {query.page < pages && <Link href={link(query.page + 1)}>Next</Link>}
      </p>
    </>
  );
}
