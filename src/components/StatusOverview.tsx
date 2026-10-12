import Link from "next/link";
import { STATUSES, STATUS_LABELS, type Status } from "@/lib/status";
import { Icon, type IconName } from "./Icon";

export type Counts = Record<Status, number> & { total: number };

const STATUS_ICONS: Record<Status, IconName> = {
  submitted: "inbox",
  in_review: "clock",
  more_info_needed: "help",
  simulated_check_passed: "checkCircle",
  simulated_check_failed: "xCircle",
  closed: "lock",
};

/** KPI cards. Every number is a live count from the database; each status card links to the filtered list. */
export function KpiCards({ counts }: { counts: Counts }) {
  return (
    <section aria-label="Applications by status" className="kpis">
      <Link href="/admin/applications" className="kpi kpi-total">
        <span className="kpi-top">
          <span className="kpi-label">Total applications</span>
          <span className="kpi-icon"><Icon name="layers" size={20} /></span>
        </span>
        <span className="kpi-value">{counts.total}</span>
      </Link>
      {STATUSES.map((s) => (
        <Link key={s} href={`/admin/applications?status=${s}`} className={`kpi kpi-${s}`}>
          <span className="kpi-top">
            <span className="kpi-label">{STATUS_LABELS[s]}</span>
            <span className="kpi-icon"><Icon name={STATUS_ICONS[s]} size={20} /></span>
          </span>
          <span className="kpi-value">{counts[s]}</span>
        </Link>
      ))}
    </section>
  );
}

/** One horizontal bar split by real counts, plus a text legend (the legend is the accessible version). */
export function StatusDistribution({ counts }: { counts: Counts }) {
  if (counts.total === 0) return null;
  const present = STATUSES.filter((s) => counts[s] > 0);
  const segments = present.map((s, i) => ({
    s,
    // Each bar starts where the previous ones end (sum of their shares).
    x: present.slice(0, i).reduce((sum, p) => sum + (counts[p] / counts.total) * 100, 0),
    width: (counts[s] / counts.total) * 100,
  }));
  return (
    <div>
      <svg className="dist-bar" viewBox="0 0 100 4" preserveAspectRatio="none" role="img" aria-label="Share of applications by status">
        {segments.map(({ s, x: sx, width }) => (
          <rect key={s} x={sx} y={0} width={width} height={4} className={`seg-${s}`} />
        ))}
      </svg>
      <ul className="legend">
        {STATUSES.map((s) => (
          <li key={s}>
            <span className={`legend-dot legend-dot-${s}`} aria-hidden="true" />
            <span>
              {STATUS_LABELS[s]}: <strong className="num">{counts[s]}</strong>{" "}
              <span className="muted num">({Math.round((counts[s] / counts.total) * 100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
