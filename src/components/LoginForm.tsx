"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Alert } from "./Alert";
import { Icon } from "./Icon";

// Contract with the server is unchanged: POST /api/admin/login with {username, password} as JSON;
// 200 -> go to /admin; any other status -> show the server's message.
export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const errorId = useId();

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
      setBusy(false);
      return;
    }
    if (res.ok) {
      // Stay in the loading state until the navigation replaces this page (no double submit).
      router.push("/admin");
      router.refresh();
      return;
    }
    setBusy(false);
    const data = await res.json().catch(() => null);
    setError(data?.error?.message ?? "Login failed");
  }

  return (
    <form onSubmit={onSubmit} className="form" aria-describedby={error ? errorId : undefined}>
      {error && <Alert tone="error" id={errorId}>{error}</Alert>}
      <div className="field">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          name="username"
          className="input"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={100}
          aria-invalid={error ? true : undefined}
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <div className="input-wrap">
          <input
            id="password"
            name="password"
            className="input"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            maxLength={200}
            aria-invalid={error ? true : undefined}
          />
          <button
            type="button"
            className="input-affix"
            onClick={() => setShow((v) => !v)}
            aria-pressed={show}
            aria-label={show ? "Hide password" : "Show password"}
          >
            <Icon name={show ? "eyeOff" : "eye"} size={20} />
          </button>
        </div>
      </div>
      <button type="submit" className="btn btn-primary btn-block" disabled={busy} aria-busy={busy}>
        {busy && <span className="spinner" aria-hidden="true" />}
        {busy ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
