import type { HistoryEntry } from "@/lib/applications";
import { formatDateTime } from "@/lib/format";
import { Icon } from "./Icon";
import { StatusBadge } from "./StatusBadge";

/** Vertical timeline, newest first. `history` is already ordered by the data layer. */
export function StatusTimeline({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) return <p className="muted">No status changes recorded yet.</p>;
  return (
    <ol className="timeline" aria-label="Status history, newest first">
      {history.map((h, i) => (
        <li key={h.id} className={`tl-item${i === 0 ? " is-latest" : ""}`}>
          <span className="tl-dot"><Icon name={h.fromStatus ? "arrowRight" : "plus"} size={14} /></span>
          <div className="tl-body">
            <div className="tl-change">
              {h.fromStatus ? (
                <>
                  <StatusBadge status={h.fromStatus} />
                  <span className="tl-arrow" aria-label="changed to">
                    <Icon name="arrowRight" size={16} />
                  </span>
                </>
              ) : (
                <span className="muted small">Created as</span>
              )}
              <StatusBadge status={h.toStatus} />
            </div>
            <div className="tl-meta">
              <time dateTime={h.changedAt}>{formatDateTime(h.changedAt)}</time>
              <span>by {h.changedBy}</span>
            </div>
            {h.note && <p className="tl-note">{h.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
