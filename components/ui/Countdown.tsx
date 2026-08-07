"use client";

import { useEffect, useRef } from "react";
import { formatCountdown } from "@/lib/format/datetime";
import { useNow } from "@/lib/ui/hooks";
import { cn } from "@/lib/utils";

export interface CountdownProps {
  /** ISO UTC target. */
  to: string | null | undefined;
  /** Below this many ms the countdown turns urgent. */
  urgentBelowMs?: number;
  className?: string;
  /** Shown when `to` is missing. */
  emptyAs?: string;
  onElapsed?: () => void;
}

/**
 * Ticks off the server-anchored clock (lib/format/clock), not the laptop's.
 * Reads the clock through useSyncExternalStore so the first paint matches.
 */
export function Countdown({
  to,
  urgentBelowMs = 5 * 60 * 1000,
  className,
  emptyAs = "—",
  onElapsed,
}: CountdownProps) {
  const nowMs = useNow(1000);
  const target = to ? Date.parse(to) : null;
  const remaining =
    nowMs === null || target === null || Number.isNaN(target)
      ? null
      : target - nowMs;

  const firedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!to || remaining === null || remaining > 0) return;
    if (firedFor.current === to) return;
    firedFor.current = to;
    onElapsed?.();
  }, [to, remaining, onElapsed]);

  if (!to) {
    return <span className={cn("text-text-muted", className)}>{emptyAs}</span>;
  }
  if (remaining === null) {
    return <span className={cn("tnum text-text-muted", className)}>· · ·</span>;
  }

  const closed = remaining <= 0;
  const urgent = !closed && remaining <= urgentBelowMs;

  return (
    <span
      className={cn(
        "tnum whitespace-nowrap",
        closed && "text-text-muted",
        urgent && "font-semibold text-danger",
        className,
      )}
    >
      {formatCountdown(remaining)}
    </span>
  );
}
