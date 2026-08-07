"use client";

import { useCallback, useSyncExternalStore } from "react";
import { now } from "@/lib/format/clock";

/**
 * A ticking clock that is safe to read during render.
 *
 * useSyncExternalStore gives a defined server snapshot (null), so countdowns
 * hydrate without a mismatch instead of needing a setState-in-effect dance.
 * The snapshot is rounded to the second so it stays referentially stable
 * between ticks.
 */
export function useNow(intervalMs = 1000): number | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const id = window.setInterval(onChange, intervalMs);
      return () => window.clearInterval(id);
    },
    [intervalMs],
  );

  return useSyncExternalStore(
    subscribe,
    () => Math.floor(now() / 1000) * 1000,
    () => null,
  );
}

const noopSubscribe = () => () => undefined;

/** True only after hydration — for anything the server cannot know (timezone). */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
