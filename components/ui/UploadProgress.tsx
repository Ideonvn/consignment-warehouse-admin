"use client";

import type { UploadItem } from "@/lib/api/use-direct-upload";
import { cn } from "@/lib/utils";

/** Per-file progress for a direct-to-storage upload. */
export function UploadProgress({ uploads }: { uploads: UploadItem[] }) {
  if (uploads.length === 0) return null;

  return (
    <ul className="mb-3 flex flex-col gap-1.5">
      {uploads.map((item) => (
        <li key={item.id} className="text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{item.name}</span>
            <span
              className={cn(
                "tnum shrink-0",
                item.status === "failed"
                  ? "text-danger-ink"
                  : item.status === "done"
                    ? "text-success-ink"
                    : "text-text-muted",
              )}
            >
              {item.status === "failed"
                ? "failed"
                : item.status === "done"
                  ? "done"
                  : item.status === "confirming"
                    ? "saving…"
                    : `${Math.round(item.progress * 100)}%`}
            </span>
          </div>
          <div className="mt-0.5 h-1 w-full overflow-hidden rounded bg-surface-sunken">
            <div
              className={cn(
                "h-full transition-[width]",
                item.status === "failed" ? "bg-danger" : "bg-accent",
              )}
              style={{
                width: `${item.status === "failed" ? 100 : item.progress * 100}%`,
              }}
            />
          </div>
          {item.error && (
            <p role="alert" className="mt-0.5 text-danger-ink">
              {item.error}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
