import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";

type Tone = "demo" | "info" | "warn" | "error" | "success";

export function Notice({ tone, title, children, role }: { tone: Tone; title?: string; children: ReactNode; role?: "alert" | "status" | "note" }) {
  const icon = tone === "error" ? "alert" : tone === "success" ? "checkCircle" : tone === "warn" ? "alert" : "info";
  const r = role ?? (tone === "error" ? "alert" : tone === "success" ? "status" : "note");
  return (
    <div className={`cj-alert cj-alert-${tone}`} role={r}>
      <Icon name={icon} size={18} />
      <div>
        {title && <strong className="cj-alert-title">{title}</strong>}
        {children}
      </div>
    </div>
  );
}

/** The one sentence every screen that shows simulated results must carry. */
export function DemoNotice({ children }: { children?: ReactNode }) {
  return (
    <Notice tone="demo" title="Demo mode">
      {children ?? "Everything on this screen is simulated. No real verification, bureau check, approval or loan decision happens in this demo."}
    </Notice>
  );
}
