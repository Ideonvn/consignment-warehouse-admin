"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { queryKeys } from "@/lib/api/query-keys";
import type { LotAdminSummary, WsServerMessage } from "@/types/api";
import { MAX_SUBSCRIBED_LOTS, RealtimeClient } from "./socket";
import { useRealtimeStore } from "./store";

/** What the socket knows that the last REST snapshot does not. */
export interface LiveLotState {
  currentBidMinor: number;
  bidCount: number;
  bidderHandle: string | null;
  effectiveEndsAt: string | null;
  extensionCount: number | null;
  status: LotAdminSummary["status"] | null;
  /** ms timestamp of the last change, used to flash the row. */
  updatedAt: number;
  lastExtendedAt: number | null;
}

export interface FeedEntry {
  id: string;
  lotId: string;
  kind: "bid" | "extended" | "closed" | "opened" | "rescheduled";
  amountMinor?: number;
  bidderHandle?: string | null;
  isAuto?: boolean;
  at: number;
  text: string;
}

const FEED_LIMIT = 60;

/**
 * Owns the socket for one auction: subscribes to its open lots, folds events
 * into a live overlay on top of the REST snapshot, and keeps an activity feed.
 */
export function useAuctionMonitor(
  auctionId: string,
  lots: LotAdminSummary[] | undefined,
) {
  const client = useQueryClient();
  const setRealtime = useRealtimeStore((s) => s.set);
  const clientRef = useRef<RealtimeClient | null>(null);

  const [live, setLive] = useState<Record<string, LiveLotState>>({});
  const [feed, setFeed] = useState<FeedEntry[]>([]);

  const refetchLots = useCallback(() => {
    void client.invalidateQueries({ queryKey: queryKeys.lots(auctionId) });
  }, [client, auctionId]);

  const handleEvent = useCallback(
    (message: WsServerMessage) => {
      const at = Date.now();
      setRealtime({ lastMessageAt: at });

      switch (message.type) {
        case "bid": {
          setLive((prev) => ({
            ...prev,
            [message.lot_id]: {
              ...prev[message.lot_id],
              currentBidMinor: message.amount_minor,
              bidCount: message.bid_count,
              bidderHandle: message.bidder_handle,
              effectiveEndsAt: prev[message.lot_id]?.effectiveEndsAt ?? null,
              extensionCount: prev[message.lot_id]?.extensionCount ?? null,
              status: prev[message.lot_id]?.status ?? null,
              updatedAt: at,
              lastExtendedAt: prev[message.lot_id]?.lastExtendedAt ?? null,
            },
          }));
          setFeed((prev) =>
            [
              {
                id: `${message.lot_id}-${message.sequence}`,
                lotId: message.lot_id,
                kind: "bid" as const,
                amountMinor: message.amount_minor,
                bidderHandle: message.bidder_handle,
                isAuto: message.is_auto,
                at,
                text: "bid",
              },
              ...prev,
            ].slice(0, FEED_LIMIT),
          );
          break;
        }
        case "lot_extended": {
          setLive((prev) => ({
            ...prev,
            [message.lot_id]: {
              ...(prev[message.lot_id] ?? {
                currentBidMinor: 0,
                bidCount: 0,
                bidderHandle: null,
                status: null,
              }),
              effectiveEndsAt: message.effective_ends_at,
              extensionCount:
                message.extension_count ??
                (prev[message.lot_id]?.extensionCount ?? 0) + 1,
              currentBidMinor: prev[message.lot_id]?.currentBidMinor ?? 0,
              bidCount: prev[message.lot_id]?.bidCount ?? 0,
              bidderHandle: prev[message.lot_id]?.bidderHandle ?? null,
              status: prev[message.lot_id]?.status ?? null,
              updatedAt: at,
              lastExtendedAt: at,
            },
          }));
          setFeed((prev) =>
            [
              {
                id: `${message.lot_id}-ext-${at}`,
                lotId: message.lot_id,
                kind: "extended" as const,
                at,
                text: "anti-snipe extension",
              },
              ...prev,
            ].slice(0, FEED_LIMIT),
          );
          break;
        }
        case "lot_closed": {
          setLive((prev) => ({
            ...prev,
            [message.lot_id]: {
              ...(prev[message.lot_id] ?? {
                currentBidMinor: 0,
                bidCount: 0,
                bidderHandle: null,
                effectiveEndsAt: null,
                extensionCount: null,
                lastExtendedAt: null,
              }),
              currentBidMinor:
                message.current_bid_minor ??
                prev[message.lot_id]?.currentBidMinor ??
                0,
              bidCount: prev[message.lot_id]?.bidCount ?? 0,
              bidderHandle: prev[message.lot_id]?.bidderHandle ?? null,
              effectiveEndsAt: prev[message.lot_id]?.effectiveEndsAt ?? null,
              extensionCount: prev[message.lot_id]?.extensionCount ?? null,
              lastExtendedAt: prev[message.lot_id]?.lastExtendedAt ?? null,
              status: message.status ?? null,
              updatedAt: at,
            },
          }));
          setFeed((prev) =>
            [
              {
                id: `${message.lot_id}-closed-${at}`,
                lotId: message.lot_id,
                kind: "closed" as const,
                at,
                text: "closed",
              },
              ...prev,
            ].slice(0, FEED_LIMIT),
          );
          // A close changes the lot's terminal status; the REST view is the
          // authority on which of the ended_* it landed in.
          refetchLots();
          break;
        }
        case "lot_rescheduled":
        case "lot_opened": {
          refetchLots();
          break;
        }
        default:
          break;
      }
    },
    [refetchLots, setRealtime],
  );

  // One client for the lifetime of the screen.
  useEffect(() => {
    const realtime = new RealtimeClient({
      onEvent: handleEvent,
      onStatus: (status, detail) =>
        setRealtime({ status, lastError: detail ?? null }),
      onSubscribedCount: (count) => setRealtime({ subscribedCount: count }),
      onNeedsRefetch: (reason) => {
        // Recorded with a timestamp: this can happen while the socket is
        // perfectly healthy, and the operator still deserves to know the
        // figures were reconciled over the API rather than streamed.
        setRealtime({ lastError: reason, lastGapAt: Date.now() });
        // Drop the overlay before refetching. It was built from events that
        // are now known to be incomplete, and since it takes precedence over
        // the REST snapshot it would otherwise pin a stale price on screen —
        // the exact gap this fallback exists to close.
        setLive({});
        refetchLots();
      },
    });
    clientRef.current = realtime;
    void realtime.connect();

    return () => {
      realtime.close();
      clientRef.current = null;
      useRealtimeStore.getState().reset();
    };
    // handleEvent and refetchLots are stable via useCallback.
  }, [handleEvent, refetchLots, setRealtime]);

  // Follow the lot set: open lots first, capped at the server's 200 per
  // connection. Anything beyond that relies on REST polling.
  useEffect(() => {
    const realtime = clientRef.current;
    if (!realtime || !lots) return;

    realtime.seedSequences(lots.map((lot) => [lot.id, lot.bid_sequence]));

    const open = lots.filter(
      (lot) => lot.status === "live" || lot.status === "scheduled",
    );
    const ordered = [...open].sort((a, b) =>
      (a.effective_ends_at ?? "").localeCompare(b.effective_ends_at ?? ""),
    );
    realtime.setLots(ordered.slice(0, MAX_SUBSCRIBED_LOTS).map((lot) => lot.id));
  }, [lots]);

  const openLotCount = (lots ?? []).filter(
    (lot) => lot.status === "live" || lot.status === "scheduled",
  ).length;

  return {
    live,
    feed,
    /** Lots the socket could not take on; they fall back to polling. */
    unsubscribedCount: Math.max(openLotCount - MAX_SUBSCRIBED_LOTS, 0),
    clearFeed: () => setFeed([]),
  };
}
