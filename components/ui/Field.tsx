"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** Shown instead of the hint when the input is frozen by the backend. */
  frozenReason?: string | null;
  className?: string;
  children: ReactNode;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  frozenReason,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-1.5 text-xs font-medium text-text"
      >
        {label}
        {required && (
          <span className="text-danger-ink" aria-hidden>
            *
          </span>
        )}
        {frozenReason && (
          <span
            title={frozenReason}
            className="rounded-sm border border-border bg-surface-sunken px-1 text-[10px] font-normal text-text-muted"
          >
            locked
          </span>
        )}
      </label>
      {children}
      {frozenReason ? (
        <p className="text-xs text-text-muted">{frozenReason}</p>
      ) : error ? (
        <p role="alert" className="text-xs font-medium text-danger-ink">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** Field with an auto-generated id wired to a single input. */
export function useFieldId(prefix: string) {
  const id = useId();
  return `${prefix}-${id}`;
}
