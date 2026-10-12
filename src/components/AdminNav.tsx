"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminNav({ user }: { user: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  async function logout() {
    setError("");
    let res: Response;
    try {
      res = await fetch("/api/admin/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {
      setError("Sign out failed (network error). Try again.");
      return;
    }
    // Only leave the page if the server confirmed it ended the session.
    if (!res.ok) {
      setError("Sign out failed. Try again.");
      return;
    }
    router.push("/admin/login");
    router.refresh();
  }
  return (
    <nav className="nav">
      <Link href="/admin">Dashboard</Link>
      <Link href="/admin/applications/new">New demo application</Link>
      <span className="spacer" />
      <span className="muted">Signed in as {user}</span>
      <button type="button" className="link" onClick={logout}>
        Sign out
      </button>
      {error && <span className="error" role="alert">{error}</span>}
    </nav>
  );
}
