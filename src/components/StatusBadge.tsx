import { isSimulatedStatus, STATUS_LABELS, type Status } from "@/lib/status";

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`badge badge-${status}`}>
      {STATUS_LABELS[status]}
      {isSimulatedStatus(status) && <span className="sim-tag">SIMULATED</span>}
    </span>
  );
}
