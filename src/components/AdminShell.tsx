"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { initialOf } from "@/lib/format";
import { Alert } from "./Alert";
import { BrandMark } from "./BrandMark";
import { Icon, type IconName } from "./Icon";

type NavLink = { href: string; label: string; icon: IconName; match: (path: string) => boolean };

// Only routes that exist are links. "Verification workflow" is a label with no page behind it yet,
// so it is rendered as plain text with a "Coming later" tag rather than a dead link.
const LINKS: NavLink[] = [
  { href: "/admin", label: "Overview", icon: "grid", match: (p) => p === "/admin" },
  { href: "/admin/applications", label: "Applications", icon: "list", match: (p) => p === "/admin/applications" || /^\/admin\/applications\/\d+/.test(p) },
  { href: "/admin/applications/new", label: "New application", icon: "plus", match: (p) => p === "/admin/applications/new" },
];

function sectionTitle(path: string): string {
  if (path === "/admin") return "Overview";
  if (path === "/admin/applications/new") return "New application";
  if (path.startsWith("/admin/applications/") ) return "Application";
  if (path.startsWith("/admin/applications")) return "Applications";
  return "Admin";
}

export function AdminShell({ user, children }: { user: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Escape closes the mobile drawer and returns focus to the button that opened it.
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function logout() {
    setError("");
    setSigningOut(true);
    let res: Response;
    try {
      res = await fetch("/api/admin/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {
      setError("Sign out failed (network error). Try again.");
      setSigningOut(false);
      return;
    }
    // Only leave the page if the server confirmed it ended the session.
    if (!res.ok) {
      setError("Sign out failed. Try again.");
      setSigningOut(false);
      return;
    }
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="admin-app">
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside id="sidebar" className={`sidebar${open ? " is-open" : ""}`} aria-label="Primary">
        <div className="sidebar-head">
          <Link href="/admin" onClick={() => setOpen(false)} aria-label="Demo Finance, overview">
            <BrandMark tone="light" />
          </Link>
          <button ref={closeButton} type="button" className="sidebar-close" onClick={() => setOpen(false)} aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>

        <nav aria-label="Main">
          <p className="nav-label">Workspace</p>
          <ul className="nav-list">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="nav-item"
                  aria-current={l.match(pathname) ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <Icon name={l.icon} size={20} />
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="nav-label">Coming later</p>
          <ul className="nav-list">
            <li>
              <span className="nav-item nav-item-static">
                <Icon name="workflow" size={20} />
                <span className="nav-static-text">
                  Verification workflow
                  <span className="chip">Not connected</span>
                </span>
              </span>
            </li>
          </ul>
        </nav>

        <div className="sidebar-foot">
          <div className="profile">
            <span className="avatar" aria-hidden="true">{initialOf(user)}</span>
            <div className="profile-text">
              <div className="profile-name">{user}</div>
              <div className="profile-role">Administrator</div>
            </div>
          </div>
          <button type="button" className="btn btn-signout btn-block" onClick={logout} disabled={signingOut}>
            <Icon name="logout" size={18} />
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </aside>

      <div className="workspace">
        <div className="topbar">
          <button
            ref={menuButton}
            type="button"
            className="topbar-menu"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="sidebar"
          >
            <Icon name="menu" />
          </button>
          <span className="topbar-title">{sectionTitle(pathname)}</span>
          <Link href="/admin/applications" className="topbar-search-link" aria-label="Search applications">
            <Icon name="search" size={20} />
          </Link>
          <form action="/admin/applications" method="get" role="search" className="search">
            <label htmlFor="global-search" className="sr-only">Search applications by name, email or reference</label>
            <Icon name="search" size={18} className="search-icon" />
            <input
              id="global-search"
              name="q"
              type="search"
              className="input"
              placeholder="Search name, email or reference"
              maxLength={100}
              autoComplete="off"
            />
          </form>
          <div className="topbar-user">
            <span className="avatar" aria-hidden="true">{initialOf(user)}</span>
            <span className="topbar-user-name">{user}</span>
          </div>
          <button type="button" className="topbar-signout" onClick={logout} disabled={signingOut} aria-label="Sign out">
            <Icon name="logout" size={20} />
          </button>
          {error && (
            <div className="signout-error">
              <Alert tone="error">{error}</Alert>
            </div>
          )}
        </div>
        <main id="main" className="content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
