"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { maskName } from "@/lib/journey/mask";
import type { JourneyDraft } from "@/lib/journey/types";
import { CjBrand } from "./CjBrand";
import { ConfirmDialog } from "./ConfirmDialog";

const NAV = [
  { href: "/apply", label: "Home", icon: "home" as const },
  { href: "/apply/journey", label: "Application journey", icon: "list" as const },
];

export function CustomerHeader({ draft, go }: { draft: JourneyDraft | null; go: (href: string) => void }) {
  const [menu, setMenu] = useState(false);
  const name = draft ? maskName(draft.personal.firstName, draft.personal.lastName) : "-";
  const display = name === "-" ? "Applicant" : name;
  const initial = display.charAt(0).toUpperCase();

  const navLink = (n: (typeof NAV)[number], onDone?: () => void) => (
    <Link key={n.href} href={n.href} className="cj-navlink" onClick={(e) => { e.preventDefault(); onDone?.(); go(n.href); }}>
      <Icon name={n.icon} size={18} />
      {n.label}
    </Link>
  );

  return (
    <header className="cj-header">
      <div className="cj-header-inner">
        <button type="button" className="cj-iconbtn cj-menu-btn" onClick={() => setMenu(true)} aria-label="Open menu" aria-haspopup="dialog">
          <Icon name="menu" />
        </button>
        <Link href="/apply" className="cj-brandlink" aria-label="Demo Finance home" onClick={(e) => { e.preventDefault(); go("/apply"); }}>
          <CjBrand />
        </Link>
        <nav className="cj-header-nav" aria-label="Primary">{NAV.map((n) => navLink(n))}</nav>
        <div className="cj-header-right">
          {draft && <span className="cj-refchip" title="Application reference">Ref <b>{draft.reference}</b></span>}
          <span className="cj-profile">
            <span className="cj-avatar" aria-hidden="true">{initial}</span>
            <span className="cj-profile-text">
              <span className="cj-profile-name">{display}</span>
              <span className="cj-profile-sub">Demo applicant</span>
            </span>
          </span>
        </div>
      </div>

      <ConfirmDialog open={menu} title="Menu" label="Navigation menu" variant="drawer" onClose={() => setMenu(false)}>
        <nav className="cj-drawer-nav" aria-label="Menu">
          {NAV.map((n) => navLink(n, () => setMenu(false)))}
          {draft && (
            <p className="cj-drawer-ref">
              Application reference
              <strong>{draft.reference}</strong>
            </p>
          )}
          <button type="button" className="cj-btn cj-btn-secondary cj-btn-block" onClick={() => setMenu(false)}>Close menu</button>
        </nav>
      </ConfirmDialog>
    </header>
  );
}
