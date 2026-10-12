"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { NOTE_REQUIRED, STATUS_LABELS, isSimulatedStatus, type Status } from "@/lib/status";
import { Alert } from "./Alert";
import { Icon } from "./Icon";

// API contract unchanged: POST /api/admin/applications/:id/status with {toStatus, note}.
export function StatusForm({ applicationId, options }: { applicationId: number; options: Status[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<Status | "">("");
  const noteId = useId();
  const noteHelpId = useId();
  const noteErrId = useId();

  if (options.length === 0) {
    return (
      <div className="stack-sm">
        {success && <Alert tone="success">{success}</Alert>}
        <Alert tone="info">This application is closed. No further changes are possible.</Alert>
      </div>
    );
  }

  // After a successful update the allowed options change; fall back to the first valid one.
  const target: Status = chosen !== "" && options.includes(chosen) ? chosen : options[0];
  const noteRequired = (NOTE_REQUIRED as readonly string[]).includes(target);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const form = e.currentTarget;
    const f = new FormData(form);
    let res: Response;
    try {
      res = await fetch(`/api/admin/applications/${applicationId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus: f.get("toStatus"), note: f.get("note") }),
      });
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
      return;
    }
    setBusy(false);
    if (res.ok) {
      form.reset();
      setChosen("");
      setSuccess(`Status updated to "${STATUS_LABELS[f.get("toStatus") as Status] ?? "new status"}". The history below has been refreshed.`);
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => null);
    setError(data?.error?.fields?.note ?? data?.error?.message ?? "Could not update status");
  }

  return (
    <form onSubmit={onSubmit} className="form">
      {success && <Alert tone="success" title="Saved">{success}</Alert>}
      <div className="field">
        <label htmlFor="toStatus">Move to</label>
        <select id="toStatus" name="toStatus" className="select" value={target} onChange={(e) => setChosen(e.target.value as Status)}>
          {options.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>
      {isSimulatedStatus(target) && (
        <Alert tone="warning">This records a SIMULATED outcome only. No real verification takes place.</Alert>
      )}
      <div className="field">
        <label htmlFor={noteId}>
          Note
          <span className={noteRequired ? "tag-required" : "tag-optional"}>{noteRequired ? "Required" : "Optional"}</span>
        </label>
        <textarea
          id={noteId}
          name="note"
          className="textarea"
          rows={3}
          maxLength={500}
          required={noteRequired}
          aria-describedby={`${noteHelpId}${error ? ` ${noteErrId}` : ""}`}
          aria-invalid={error ? true : undefined}
        />
        <p id={noteHelpId} className="hint">
          {noteRequired
            ? "A short explanation (at least 3 characters) is required for this status and is saved to the history."
            : "Optional context saved with this change. Do not enter PAN, Aadhaar or other real identity data."}
        </p>
        {error && (
          <p id={noteErrId} className="field-error" role="alert">
            <Icon name="alert" size={16} />
            {error}
          </p>
        )}
      </div>
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {busy ? "Saving..." : "Update status"}
        </button>
      </div>
    </form>
  );
}
