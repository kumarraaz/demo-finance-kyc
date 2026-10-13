"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type ActionButton = {
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  busy?: boolean;
  icon?: ReactNode;
};

const spinner = <span className="spinner" aria-hidden="true" />;

function Btn({ b, kind }: { b: ActionButton; kind: "primary" | "secondary" | "ghost" }) {
  const cls = `cj-btn cj-btn-${kind}`;
  if (b.href && !b.disabled) {
    return <Link href={b.href} className={cls} onClick={b.onClick}>{b.icon}{b.label}</Link>;
  }
  return (
    <button type="button" className={cls} onClick={b.onClick} disabled={b.disabled || b.busy} aria-busy={b.busy ? true : undefined}>
      {b.busy ? spinner : b.icon}
      {b.label}
    </button>
  );
}

/**
 * Bottom action bar. It is sticky inside the page column, so it stays reachable while scrolling but sits after the
 * last field instead of covering it, and it pads for the phone's safe area.
 */
export function ActionBar({ back, secondary, primary, stepLabel, note }: { back?: ActionButton; secondary?: ActionButton; primary?: ActionButton; stepLabel?: string; note?: ReactNode }) {
  return (
    <div className="cj-actionbar" role="group" aria-label="Page actions">
      {(stepLabel || note) && (
        <div className="cj-actionbar-meta">
          {stepLabel && <span className="cj-actionbar-step">{stepLabel}</span>}
          {note && <span className="cj-actionbar-note" role="status">{note}</span>}
        </div>
      )}
      <div className="cj-actionbar-buttons">
        {back && <Btn b={back} kind="ghost" />}
        {secondary && <Btn b={secondary} kind="secondary" />}
        {primary && <Btn b={primary} kind="primary" />}
      </div>
    </div>
  );
}
