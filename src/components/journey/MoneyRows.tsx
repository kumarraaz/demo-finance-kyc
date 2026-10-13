import type { ReactNode } from "react";
import { formatPaise } from "@/lib/journey/money";

export function Row({ label, children, kind }: { label: ReactNode; children: ReactNode; kind?: "total" | "sub" }) {
  return (
    <div className={kind ? `is-${kind}` : undefined}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export const money = (paise: number) => formatPaise(paise);
export const pct = (bps: number) => `${(bps / 100).toFixed(2)}% per year`;
