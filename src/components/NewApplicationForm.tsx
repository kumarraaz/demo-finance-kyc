"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LOAN_PRODUCTS } from "@/lib/validation";

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
    const res = await fetch("/api/admin/applications", {
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
    setBusy(false);
    const data = await res.json().catch(() => null);
    if (res.status === 201) {
      router.push(`/admin/applications/${data.application.id}`);
      router.refresh();
      return;
    }
    setErrors(data?.error?.fields ?? {});
    setMessage(data?.error?.message ?? "Could not save");
  }

  return (
    <form onSubmit={onSubmit} className="card form" noValidate>
      <p className="notice">
        Use <strong>fictional</strong> data only. Do not enter a PAN, Aadhaar number or any real identity data. These
        are rejected.
      </p>
      <label>
        Applicant name (fictional)
        <input name="applicantName" required maxLength={100} />
        {errors.applicantName && <span className="error">{errors.applicantName}</span>}
      </label>
      <label>
        Email (fictional)
        <input name="email" type="email" required maxLength={254} />
        {errors.email && <span className="error">{errors.email}</span>}
      </label>
      <label>
        Loan product (demo)
        <select name="loanProduct" defaultValue="personal">
          {LOAN_PRODUCTS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        {errors.loanProduct && <span className="error">{errors.loanProduct}</span>}
      </label>
      <label>
        Requested amount (demo, INR)
        <input name="requestedAmount" type="number" min={1000} max={10000000} step={1} required />
        {errors.requestedAmount && <span className="error">{errors.requestedAmount}</span>}
      </label>
      <label>
        Purpose (optional)
        <input name="purpose" maxLength={200} />
        {errors.purpose && <span className="error">{errors.purpose}</span>}
      </label>
      {message && <p className="error" role="alert">{message}</p>}
      <button type="submit" disabled={busy}>{busy ? "Saving..." : "Create demo application"}</button>
    </form>
  );
}
