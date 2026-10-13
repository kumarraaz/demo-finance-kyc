"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Modal dialog on the native <dialog> element: the browser traps focus, makes the rest of the page inert and closes it
 * on Escape. Focus returns to the element that opened it.
 */
export function ConfirmDialog({
  open, title, children, actions, onClose, label, variant = "modal",
}: {
  open: boolean; title: string; children: ReactNode; actions?: ReactNode; onClose: () => void; label?: string; variant?: "modal" | "drawer";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      opener.current = document.activeElement;
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
      (opener.current as HTMLElement | null)?.focus?.();
    }
  }, [open]);

  return (
    <dialog ref={ref} className={`cj-dialog cj-dialog-${variant}`} aria-label={label ?? title} onCancel={(e) => { e.preventDefault(); onClose(); }} onClose={onClose}>
      <h2>{title}</h2>
      <div className="cj-dialog-body">{children}</div>
      {actions && <div className="cj-dialog-actions">{actions}</div>}
    </dialog>
  );
}
