"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    let res: Response;
    try {
      res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
      });
    } catch {
      // Network failure: show it, and never leave the button stuck on "Signing in...".
      setError("Network error. Try again.");
      return;
    } finally {
      setBusy(false);
    }
    if (res.ok) {
      router.push("/admin");
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => null);
    setError(data?.error?.message ?? "Login failed");
  }

  return (
    <form onSubmit={onSubmit} className="card form">
      <label>
        Username
        <input name="username" autoComplete="username" required maxLength={100} />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required maxLength={200} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
    </form>
  );
}
