"use client";

import { useRealtimeStore } from "@/lib/realtime/store";
import { cn } from "@/lib/utils";

const LABELS: Record<string, { text: string; dot: string; title: string }> = {
  idle: {
    text: "Not live",
    dot: "bg-text-muted",
    title: "This screen does not need the live feed",
  },
  connecting: {
    text: "Connecting",
    dot: "bg-warning",
    title: "Opening the live feed",
  },
  open: {
    text: "Live",
    dot: "bg-success",
    title: "Receiving bids in real time",
  },
  reconnecting: {
    text: "Reconnecting",
    dot: "bg-warning",
    title: "Lost the live feed, retrying — numbers may be stale",
  },
  offline: {
    text: "Offline",
    dot: "bg-danger",
    title: "No live feed. Figures refresh only when you reload.",
  },
};

/** Honest about staleness: it never says "Live" unless the socket is open. */
export function ConnectionIndicator() {
  const status = useRealtimeStore((s) => s.status);
  const subscribed = useRealtimeStore((s) => s.subscribedCount);
  const meta = LABELS[status] ?? LABELS.idle;

  return (
    <span
      title={
        status === "open" && subscribed > 0
          ? `${meta.title} · ${subscribed} lots subscribed`
          : meta.title
      }
      className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-2 py-1 text-xs text-text-muted"
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          meta.dot,
          status === "open" && "pulse-live",
        )}
      />
      <span className="hidden sm:inline">{meta.text}</span>
      {status === "open" && subscribed > 0 && (
        <span className="tnum hidden md:inline">· {subscribed}</span>
      )}
    </span>
  );
}
