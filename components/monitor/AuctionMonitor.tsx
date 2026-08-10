"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Countdown } from "@/components/ui/Countdown";
import { EmptyState, ErrorState, Note, Skeleton } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataPoint, Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { errorMessage } from "@/lib/api/errors";
import { useAuction, useLots } from "@/lib/api/queries";
import { formatClockTime } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import { useRealtimeStore } from "@/lib/realtime/store";
import { useAuctionMonitor, type LiveLotState } from "@/lib/realtime/use-monitor";
import { useSetAuctionContext } from "@/lib/ui/auction-context";
import { usePageTitle } from "@/lib/ui/use-page-title";
import { useNow } from "@/lib/ui/hooks";
import { cn } from "@/lib/utils";
import type { LotAdminSummary } from "@/types/api";

/** REST snapshot with anything the socket has since told us folded on top. */
function merge(lot: LotAdminSummary, live: LiveLotState | undefined) {
  if (!live) return { lot, handle: lot.current_leader_handle };
  return {
    lot: {
      ...lot,
      current_bid_minor: live.currentBidMinor || lot.current_bid_minor,
      bid_count: Math.max(live.bidCount, lot.bid_count),
      effective_ends_at: live.effectiveEndsAt ?? lot.effective_ends_at,
      extension_count: live.extensionCount ?? lot.extension_count,
      status: live.status ?? lot.status,
    },
    handle: live.bidderHandle ?? lot.current_leader_handle,
  };
}

export function AuctionMonitor({ auctionId }: { auctionId: string }) {
  const auctionQuery = useAuction(auctionId);
  useSetAuctionContext(auctionQuery.data);
  usePageTitle(
    auctionQuery.data ? `Monitor · ${auctionQuery.data.name}` : "Monitor",
  );

  // Polling is the floor under the socket, not a replacement for it: lots
  // beyond the 200-lot subscription cap depend on this entirely.
  const lotsQuery = useLots(auctionId, { refetchInterval: 20_000 });
  const lots = useMemo(() => lotsQuery.data ?? [], [lotsQuery.data]);

  const { live, feed, unsubscribedCount } = useAuctionMonitor(auctionId, lots);
  const nowMs = useNow(1000);
  const connectionStatus = useRealtimeStore((s) => s.status);
  const lastError = useRealtimeStore((s) => s.lastError);
  const lastGapAt = useRealtimeStore((s) => s.lastGapAt);

  const auction = auctionQuery.data;
  const currency = auction?.currency_code ?? "ZAR";

  const merged = useMemo(
    () => lots.map((lot) => merge(lot, live[lot.id])),
    [lots, live],
  );

  const openLots = merged.filter(
    (row) => row.lot.status === "live" || row.lot.status === "scheduled",
  );
  const sorted = [...merged].sort((a, b) => {
    const aOpen = a.lot.status === "live" || a.lot.status === "scheduled";
    const bOpen = b.lot.status === "live" || b.lot.status === "scheduled";
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    return (a.lot.effective_ends_at ?? "").localeCompare(
      b.lot.effective_ends_at ?? "",
    );
  });

  const stats = {
    live: merged.filter((row) => row.lot.status === "live").length,
    ended: merged.filter((row) => row.lot.status.startsWith("ended")).length,
    total: merged.reduce(
      (sum, row) => sum + (row.lot.current_bid_minor ?? 0),
      0,
    ),
    reserveNotMet: merged.filter(
      (row) => row.lot.status === "ended_reserve_not_met",
    ).length,
  };

  const titleById = new Map(lots.map((lot) => [lot.id, lot.title]));

  if (auctionQuery.error) {
    return (
      <ErrorState
        message={errorMessage(auctionQuery.error)}
        onRetry={() => void auctionQuery.refetch()}
      />
    );
  }

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Auctions", href: "/auctions" },
          {
            label: auction?.name ?? "Auction",
            href: `/auctions/${auctionId}`,
          },
          { label: "Monitor" },
        ]}
        title={
          <span className="flex items-center gap-2">
            {auction?.name ?? "Monitor"}
            {auction && <StatusBadge status={auction.status} kind="auction" />}
          </span>
        }
        subtitle="Bids land here as they happen. The indicator in the top bar tells you whether this is live or stale."
      />

      {connectionStatus !== "open" && (
        <Note
          tone={connectionStatus === "offline" ? "danger" : "warning"}
          className="mb-3"
        >
          {connectionStatus === "connecting"
            ? "Opening the live feed…"
            : connectionStatus === "reconnecting"
              ? "Lost the live feed and retrying. Figures below refresh every 20 seconds in the meantime."
              : "No live feed. Figures below refresh every 20 seconds."}
          {lastError && (
            <span className="mt-1 block text-xs">{lastError}</span>
          )}
        </Note>
      )}

      {connectionStatus === "open" &&
        lastGapAt !== null &&
        nowMs !== null &&
        nowMs - lastGapAt < 30_000 && (
          <Note tone="warning" className="mb-3">
            The live feed missed some events and could not replay them, so these
            figures were just reloaded from the API instead. Everything below is
            current.
            {lastError && <span className="mt-1 block text-xs">{lastError}</span>}
          </Note>
        )}

      {unsubscribedCount > 0 && (
        <Note tone="warning" className="mb-3">
          This auction has more open lots than one connection can watch (the cap
          is 200). The {unsubscribedCount} closing latest are not on the live
          feed and update on the 20-second poll instead.
        </Note>
      )}

      <Panel className="mb-3" bodyClassName="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DataPoint label="Lots live">
          <span className="tnum text-lg font-semibold">{stats.live}</span>
        </DataPoint>
        <DataPoint label="Lots ended">
          <span className="tnum text-lg font-semibold">{stats.ended}</span>
        </DataPoint>
        <DataPoint label="Total on the table">
          <span className="tnum text-lg font-semibold">
            {formatMoney(stats.total, currency)}
          </span>
        </DataPoint>
        <DataPoint label="Reserve not met">
          <span
            className={cn(
              "tnum text-lg font-semibold",
              stats.reserveNotMet > 0 && "text-warning-ink",
            )}
          >
            {stats.reserveNotMet}
          </span>
        </DataPoint>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <Panel
          title="Lots"
          description={`${openLots.length} still open`}
          bodyClassName="p-0"
        >
          {lotsQuery.isPending ? (
            <div className="p-3">
              <Skeleton className="h-64 w-full" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-3">
              <EmptyState title="This auction has no lots" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-sunken">
                  <tr>
                    <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                      Lot
                    </th>
                    <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                      Status
                    </th>
                    <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                      Current bid
                    </th>
                    <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                      Bids
                    </th>
                    <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                      Leader
                    </th>
                    <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                      Ext
                    </th>
                    <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                      Closes in
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(({ lot, handle }) => {
                    const liveState = live[lot.id];
                    const justExtended =
                      liveState?.lastExtendedAt !== null &&
                      liveState?.lastExtendedAt !== undefined &&
                      nowMs !== null &&
                      nowMs - liveState.lastExtendedAt < 15_000;
                    const open =
                      lot.status === "live" || lot.status === "scheduled";
                    return (
                      <tr
                        key={lot.id}
                        className={cn(
                          "border-t border-border",
                          liveState && "flash-update",
                          lot.status === "ended_reserve_not_met" && "bg-warning-tint",
                        )}
                      >
                        <td className="px-2.5 py-1.5">
                          <Link
                            href={`/lots/${lot.id}`}
                            className="font-medium hover:underline"
                          >
                            <span className="tnum text-text-muted">
                              #{lot.lot_number ?? "—"}
                            </span>{" "}
                            {lot.title}
                          </Link>
                        </td>
                        <td className="px-2.5 py-1.5">
                          <StatusBadge status={lot.status} kind="lot" />
                        </td>
                        <td className="tnum px-2.5 py-1.5 text-right font-medium">
                          {formatMoney(lot.current_bid_minor, currency, {
                            emptyAs: "—",
                          })}
                        </td>
                        <td className="tnum px-2.5 py-1.5 text-right">
                          {lot.bid_count}
                        </td>
                        <td className="px-2.5 py-1.5 text-xs">
                          {handle ?? <span className="text-text-muted">—</span>}
                        </td>
                        <td className="tnum px-2.5 py-1.5 text-right">
                          {lot.extension_count > 0 ? (
                            <span
                              className={cn(
                                "font-semibold text-warning-ink",
                                justExtended &&
                                  "rounded bg-warning px-1 text-warning-fill-ink",
                              )}
                              title={
                                justExtended
                                  ? "This lot just moved its own clock"
                                  : "Anti-snipe extensions earned"
                              }
                            >
                              +{lot.extension_count}
                            </span>
                          ) : (
                            <span className="text-text-muted">0</span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 text-right">
                          {open ? (
                            <Countdown to={lot.effective_ends_at} />
                          ) : (
                            <span className="text-xs text-text-muted">
                              closed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          title="Activity"
          description={feed.length === 0 ? "Nothing yet" : `${feed.length} events`}
        >
          {feed.length === 0 ? (
            <p className="text-sm text-text-muted">
              Bids across this auction appear here the moment they land.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {feed.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-col border-b border-border pb-1.5 text-xs last:border-b-0"
                >
                  <span className="flex items-center justify-between gap-2">
                    <Link
                      href={`/lots/${entry.lotId}`}
                      className="truncate font-medium hover:underline"
                    >
                      {titleById.get(entry.lotId) ?? "Lot"}
                    </Link>
                    <span className="tnum shrink-0 text-text-muted">
                      {formatClockTime(entry.at)}
                    </span>
                  </span>
                  {entry.kind === "bid" ? (
                    <span className="tnum">
                      {formatMoney(entry.amountMinor ?? 0, currency)} ·{" "}
                      {entry.bidderHandle ?? "unknown"}
                      {entry.isAuto && " (auto)"}
                    </span>
                  ) : entry.kind === "extended" ? (
                    <span className="font-medium text-warning-ink">
                      Anti-snipe extension — the clock moved
                    </span>
                  ) : (
                    <span className="text-text-muted">{entry.text}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
