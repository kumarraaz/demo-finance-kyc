import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type Tone = "error" | "success" | "warning" | "info";
const ICONS: Record<Tone, IconName> = { error: "alert", success: "checkCircle", warning: "info", info: "info" };

/** Inline message. Errors use role="alert" (announced at once); the rest use role="status" or "note". */
export function Alert({
  tone,
  title,
  children,
  id,
}: {
  tone: Tone;
  title?: string;
  children: ReactNode;
  id?: string;
}) {
  const role = tone === "error" ? "alert" : tone === "success" ? "status" : "note";
  return (
    <div className={`alert alert-${tone}`} role={role} id={id}>
      <Icon name={ICONS[tone]} size={18} />
      <div>
        {title && <span className="alert-title">{title}</span>}
        {children}
      </div>
    </div>
  );
}
