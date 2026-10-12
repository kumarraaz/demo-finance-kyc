"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LOAN_PRODUCTS } from "@/lib/validation";
import { formatProduct } from "@/lib/format";
import { Alert } from "./Alert";
import { Icon } from "./Icon";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="field-error" role="alert">
      <Icon name="alert" size={16} />
      {message}
    </p>
  );
}

// API contract unchanged: POST /api/admin/applications; 201 -> open the new record.
export function NewApplicationForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage("");
    const f = new FormData(e.currentTarget);
    let res: Response;
    try {
      res = await fetch("/api/admin/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicantName: f.get("applicantName"),
          email: f.get("email"),
          loanProduct: f.get("loanProduct"),
          requestedAmount: Number(f.get("requestedAmount")),
          purpose: f.get("purpose"),
        }),
      });
    } catch {
      setMessage("Network error. Try again.");
      setBusy(false);
      return;
    }
    const data = await res.json().catch(() => null);
    if (res.status === 201) {
      router.push(`/admin/applications/${data.application.id}`);
      router.refresh();
      return;
    }
    setBusy(false);
    setErrors(data?.error?.fields ?? {});
    setMessage(data?.error?.message ?? "Could not save");
  }

  const bad = (k: string) => (errors[k] ? true : undefined);
  const desc = (k: string) => (errors[k] ? `err-${k}` : undefined);

  return (
    <form onSubmit={onSubmit} className="form" noValidate>
      <Alert tone="warning" title="Fictional data only">
        Do not enter a PAN, Aadhaar number or any real identity data. These are rejected.
      </Alert>
      {message && <Alert tone="error">{message}</Alert>}

      <div className="field">
        <label htmlFor="applicantName">Applicant name (fictional) <span className="tag-required">Required</span></label>
        <input id="applicantName" name="applicantName" className="input" required maxLength={100} autoComplete="off" aria-invalid={bad("applicantName")} aria-describedby={desc("applicantName")} />
        <FieldError id="err-applicantName" message={errors.applicantName} />
      </div>
      <div className="field">
        <label htmlFor="email">Email (fictional) <span className="tag-required">Required</span></label>
        <input id="email" name="email" type="email" className="input" required maxLength={254} autoComplete="off" aria-invalid={bad("email")} aria-describedby={desc("email")} />
        <FieldError id="err-email" message={errors.email} />
      </div>
      <div className="field">
        <label htmlFor="loanProduct">Loan product (demo)</label>
        <select id="loanProduct" name="loanProduct" className="select" defaultValue="personal" aria-invalid={bad("loanProduct")} aria-describedby={desc("loanProduct")}>
          {LOAN_PRODUCTS.map((p) => (
            <option key={p} value={p}>{formatProduct(p)}</option>
          ))}
        </select>
        <FieldError id="err-loanProduct" message={errors.loanProduct} />
      </div>
      <div className="field">
        <label htmlFor="requestedAmount">Requested amount (demo, INR) <span className="tag-required">Required</span></label>
        <input id="requestedAmount" name="requestedAmount" type="number" inputMode="numeric" className="input" min={1000} max={10000000} step={1} required aria-invalid={bad("requestedAmount")} aria-describedby={`hint-amount${errors.requestedAmount ? " err-requestedAmount" : ""}`} />
        <p id="hint-amount" className="hint">Whole rupees, between 1,000 and 1,00,00,000.</p>
        <FieldError id="err-requestedAmount" message={errors.requestedAmount} />
      </div>
      <div className="field">
        <label htmlFor="purpose">Purpose <span className="tag-optional">Optional</span></label>
        <input id="purpose" name="purpose" className="input" maxLength={200} aria-invalid={bad("purpose")} aria-describedby={desc("purpose")} />
        <FieldError id="err-purpose" message={errors.purpose} />
      </div>
      <div className="page-actions">
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {busy ? "Saving..." : "Create demo application"}
        </button>
      </div>
    </form>
  );
}
