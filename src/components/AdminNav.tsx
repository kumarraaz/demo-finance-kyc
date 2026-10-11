"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function AdminNav({ user }: { user: string }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
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
    </nav>
  );
}
