"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { NOTE_REQUIRED, STATUS_LABELS, isSimulatedStatus, type Status } from "@/lib/status";

export function StatusForm({ applicationId, options }: { applicationId: number; options: Status[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<Status | "">(options[0] ?? "");

  if (options.length === 0) return <p className="muted">This application is closed. No further changes are possible.</p>;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const res = await fetch(`/api/admin/applications/${applicationId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStatus: f.get("toStatus"), note: f.get("note") }),
    });
    setBusy(false);
    if (res.ok) {
      (e.target as HTMLFormElement).reset();
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => null);
    setError(data?.error?.fields?.note ?? data?.error?.message ?? "Could not update status");
  }

  const noteRequired = target !== "" && (NOTE_REQUIRED as readonly string[]).includes(target);

  return (
    <form onSubmit={onSubmit} className="form">
      <label>
        Move to
        <select name="toStatus" value={target} onChange={(e) => setTarget(e.target.value as Status)}>
          {options.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      {target !== "" && isSimulatedStatus(target) && (
        <p className="notice">This records a SIMULATED outcome only. No real verification takes place.</p>
      )}
      <label>
        Note {noteRequired ? "(required)" : "(optional)"}
        <textarea name="note" rows={3} maxLength={500} required={noteRequired} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Saving..." : "Update status"}</button>
    </form>
  );
}
