"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { clockOffsetMs } from "@/lib/format/clock";
import { formatCountdown } from "@/lib/format/datetime";
import { useIsOnline } from "@/lib/ui/online";
import { useNow } from "@/lib/ui/hooks";

/** Above this the operator's clock is wrong enough to be worth saying so. */
const CLOCK_WARN_MS = 60_000;

/**
 * Two honest banners: the browser has lost the network, or the device clock
 * disagrees with the server's badly enough that raw timestamps will look wrong.
 */
export function StatusBanners() {
  const online = useIsOnline();
  const client = useQueryClient();
  const wasOffline = useRef(false);
  const [recovered, setRecovered] = useState(false);

  // Reading the offset on the tick keeps this current without a render-time
  // impure call.
  const tick = useNow(30_000);
  const offset = tick === null ? 0 : clockOffsetMs();

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      setRecovered(true);
      void client.invalidateQueries();
      const id = window.setTimeout(() => setRecovered(false), 5000);
      return () => window.clearTimeout(id);
    }
  }, [online, client]);

  if (!online) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 border-b border-danger bg-danger-tint px-3 py-1.5 text-xs text-danger-ink"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-danger" />
        <strong>Offline.</strong> Nothing on this screen is updating, and
        anything you submit will fail until the connection is back.
      </div>
    );
  }

  if (recovered) {
    return (
      <div
        role="status"
        className="border-b border-success-tint-border bg-success-tint px-3 py-1.5 text-xs text-success-ink"
      >
        Back online — everything on screen has been refreshed.
      </div>
    );
  }

  if (Math.abs(offset) > CLOCK_WARN_MS) {
    return (
      <div
        role="status"
        className="border-b border-warning-tint-border bg-warning-tint px-3 py-1.5 text-xs text-warning-ink"
      >
        This device&apos;s clock is {formatCountdown(Math.abs(offset))}{" "}
        {offset > 0 ? "behind" : "ahead of"} the server. Countdowns here are
        corrected against the server, but your computer&apos;s own clock is
        wrong.
      </div>
    );
  }

  return null;
}
