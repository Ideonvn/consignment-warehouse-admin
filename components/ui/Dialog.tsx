"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg";
  /** Destructive dialogs get a red rule so they never look routine. */
  tone?: "neutral" | "danger" | "warning";
}

const WIDTHS = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
};

/**
 * Built on the native <dialog>: Esc to close, focus trapping and the top
 * layer come for free, and there is no focus-management library to maintain.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "md",
  tone = "neutral",
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onClick={(event) => {
        // Clicks land on the dialog element itself only when they hit backdrop.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface p-0 text-text shadow-xl",
        "backdrop:bg-scrim",
        WIDTHS[width],
      )}
      aria-labelledby="dialog-title"
    >
      <div
        className={cn(
          "border-t-2",
          tone === "danger"
            ? "border-t-danger"
            : tone === "warning"
              ? "border-t-warning"
              : "border-t-accent",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
          <div className="flex flex-col gap-1">
            <h2 id="dialog-title" className="text-lg font-semibold">
              {title}
            </h2>
            {description && (
              <div className="text-sm text-text-muted">{description}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded px-1.5 py-0.5 text-text-muted hover:bg-surface-sunken hover:text-text"
          >
            ✕
          </button>
        </div>
        {children && (
          <div className="max-h-[70vh] overflow-y-auto px-4 py-3">{children}</div>
        )}
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-sunken px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
