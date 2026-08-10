"use client";

import Link from "next/link";
import { Countdown } from "@/components/ui/Countdown";
import { ErrorState, Note, Skeleton } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataPoint, Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { errorMessage } from "@/lib/api/errors";
import { useAuction, useLot } from "@/lib/api/queries";
import { formatDateTime } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import { useSetAuctionContext } from "@/lib/ui/auction-context";
import { usePageTitle } from "@/lib/ui/use-page-title";
import { BidHistory } from "./BidHistory";
import { LotActions } from "./LotActions";
import { LotEditForm } from "./LotEditForm";
import { LotImages } from "./LotImages";

export function LotDetail({ lotId }: { lotId: string }) {
  const lotQuery = useLot(lotId);
  const lot = lotQuery.data;
  const auctionQuery = useAuction(lot?.auction_id);
  useSetAuctionContext(auctionQuery.data);
  usePageTitle(lot ? `Lot ${lot.lot_number ?? ""} · ${lot.title}` : null);

  const currency = auctionQuery.data?.currency_code ?? "ZAR";

  if (lotQuery.error) {
    return (
      <ErrorState
        title="Could not load that lot"
        message={errorMessage(lotQuery.error)}
        onRetry={() => void lotQuery.refetch()}
      />
    );
  }

  if (!lot) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const belowReserve =
    lot.reserve_price_minor !== null &&
    (lot.current_bid_minor ?? 0) < lot.reserve_price_minor;
  const open = lot.status === "live" || lot.status === "scheduled";

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Auctions", href: "/auctions" },
          {
            label: auctionQuery.data?.name ?? "Auction",
            href: `/auctions/${lot.auction_id}?tab=lots`,
          },
          { label: `Lot ${lot.lot_number ?? ""}` },
        ]}
        title={
          <span className="flex items-center gap-2">
            <span className="tnum text-text-muted">
              #{lot.lot_number ?? "—"}
            </span>
            {lot.title}
            <StatusBadge status={lot.status} kind="lot" />
          </span>
        }
        actions={<LotActions lot={lot} currency={currency} />}
      />

      {lot.relisted_from_lot_id && (
        <Note tone="info" className="mb-3">
          This lot was relisted from{" "}
          <Link
            href={`/lots/${lot.relisted_from_lot_id}`}
            className="font-medium underline"
          >
            an earlier lot
          </Link>
          . Bids and extensions were not carried over.
        </Note>
      )}

      {lot.status === "ended_reserve_not_met" && (
        <Note tone="warning" className="mb-3">
          <p className="font-semibold">This lot needs a decision.</p>
          <p className="mt-1">
            It closed at {formatMoney(lot.current_bid_minor, currency)} against a
            reserve of {formatMoney(lot.reserve_price_minor, currency)} — short
            by{" "}
            {formatMoney(
              Math.max(
                (lot.reserve_price_minor ?? 0) - (lot.current_bid_minor ?? 0),
                0,
              ),
              currency,
            )}
            . Accept the top bid, or relist it in another auction.
          </p>
        </Note>
      )}

      <Panel
        className="mb-3"
        bodyClassName="grid gap-4 sm:grid-cols-3 lg:grid-cols-6"
      >
        <DataPoint label="Starting price">
          <span className="tnum">
            {formatMoney(lot.starting_price_minor, currency)}
          </span>
        </DataPoint>
        <DataPoint label="Reserve">
          <span className="tnum">
            {lot.reserve_price_minor === null
              ? "none"
              : formatMoney(lot.reserve_price_minor, currency)}
          </span>
        </DataPoint>
        <DataPoint label="Current bid">
          <span
            className={`tnum ${belowReserve && lot.bid_count > 0 ? "text-warning-ink" : ""}`}
          >
            {formatMoney(lot.current_bid_minor, currency, { emptyAs: "—" })}
          </span>
        </DataPoint>
        <DataPoint label="Bids">
          <span className="tnum">{lot.bid_count}</span>
        </DataPoint>
        <DataPoint label="Extensions">
          <span className="tnum">
            {lot.extension_count}
            {lot.extension_count > 0 &&
              auctionQuery.data &&
              ` of ${auctionQuery.data.max_extensions}`}
          </span>
        </DataPoint>
        <DataPoint label={open ? "Closes in" : "Closed"}>
          {open ? (
            <Countdown to={lot.effective_ends_at} />
          ) : (
            <span className="tnum text-xs">
              {formatDateTime(lot.effective_ends_at)}
            </span>
          )}
        </DataPoint>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4">
          <LotEditForm lot={lot} currency={currency} />
          <BidHistory
            lotId={lot.id}
            auctionId={lot.auction_id}
            currency={currency}
          />
        </div>
        <div className="flex flex-col gap-4">
          <LotImages lotId={lot.id} />
          <Panel title="Timing">
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-text-muted">Scheduled close</dt>
                <dd className="tnum text-right">
                  {formatDateTime(lot.scheduled_ends_at)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-text-muted">Effective close</dt>
                <dd className="tnum text-right">
                  {formatDateTime(lot.effective_ends_at)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-text-muted">Leading bidder</dt>
                <dd className="text-right">
                  {lot.current_leader_user_id ? (
                    <Link
                      href={`/users/${lot.current_leader_user_id}`}
                      className="underline"
                    >
                      {lot.current_leader_handle ?? "View bidder"}
                    </Link>
                  ) : (
                    <span className="text-text-muted">none</span>
                  )}
                </dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
