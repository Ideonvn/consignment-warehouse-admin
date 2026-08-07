"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded bg-surface-sunken", className)}
    />
  );
}

/** Placeholder rows that match the table's density, not a page spinner. */
export function TableSkeleton({
  rows = 8,
  columns = 6,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="overflow-hidden rounded border border-border bg-surface">
      <div className="flex h-9 items-center gap-4 border-b border-border bg-surface-sunken px-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1 bg-border" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex h-9 items-center gap-4 border-b border-border px-3 last:border-b-0"
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded border border-dashed border-border-strong bg-surface px-6 py-10 text-center",
        className,
      )}
    >
      <p className="text-sm font-semibold text-text">{title}</p>
      {description && (
        <p className="max-w-md text-sm text-text-muted">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "That did not load",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded border border-danger bg-[#fef2f2] px-4 py-3"
    >
      <p className="text-sm font-semibold text-danger-ink">{title}</p>
      <p className="text-sm text-danger-ink">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-medium text-danger-ink underline underline-offset-2"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/** Inline callout for explaining rules the operator would otherwise guess at. */
export function Note({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "warning" | "danger";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded border px-3 py-2 text-sm",
        tone === "info" && "border-[#bfdbfe] bg-[#eff6ff] text-text",
        tone === "warning" && "border-[#fde68a] bg-[#fffbeb] text-warning-ink",
        tone === "danger" && "border-[#fecaca] bg-[#fef2f2] text-danger-ink",
        className,
      )}
    >
      {children}
    </div>
  );
}
