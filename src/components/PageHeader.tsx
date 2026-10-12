import Link from "next/link";
import type { ReactNode } from "react";

export type Crumb = { label: string; href?: string };

export function PageHeader({
  title,
  crumbs,
  subtitle,
  badge,
  actions,
}: {
  title: string;
  crumbs: Crumb[];
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-main">
        <nav aria-label="Breadcrumb">
          <ol className="crumbs">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <li key={c.label} aria-current={last ? "page" : undefined}>
                  {c.href && !last ? <Link href={c.href}>{c.label}</Link> : c.label}
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="page-title-row">
          <h1>{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
