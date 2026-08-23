"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Countdown } from "@/components/ui/Countdown";
import { CopyLinkButton } from "@/components/ui/CopyLinkButton";
import { ErrorState, Note, Skeleton } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataPoint, Panel } from "@/components/ui/Panel";
import { LotProgressBadge, StatusBadge } from "@/components/ui/StatusBadge";
import { errorMessage } from "@/lib/api/errors";
import { useAuction, useLot } from "@/lib/api/queries";
import { formatDateTime } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import { useSetAuctionContext } from "@/lib/ui/auction-context";
import { usePageTitle } from "@/lib/ui/use-page-title";
import { publicLotUrl } from "@/lib/config/bidder-app";
import { BidHistory } from "./BidHistory";
import { LotActions } from "./LotActions";
import { LotEditForm } from "./LotEditForm";
import { LotImages } from "./LotImages";
import { PublishLotDialog } from "./PublishLotDialog";

export function LotDetail({ lotId }: { lotId: string }) {
  const [publishing, setPublishing] = useState(false);
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
            {/* Same rule as the lists: it appears only when it says something
                the status badge does not. "Live · Live" reads as a glitch. */}
            <LotProgressBadge progress={lot.progress} />
          </span>
        }
        actions={
          <>
            {/* A single lot is what actually gets posted into a group chat, so
                the share link is here as well as on the auction. Lots inherit
                their auction's visibility and have no flag of their own, so
                this appears only when that auction is public — a link to a lot
                in a private auction goes nowhere. */}
            {auctionQuery.data?.visibility === "public" &&
              lot.is_visible_to_bidders && (
                <CopyLinkButton
                  url={publicLotUrl(lot.id)}
                  label="Copy lot link"
                  size="md"
                />
              )}
            <LotActions lot={lot} currency={currency} />
          </>
        }
      />

      {lot.progress === "needs_publish" && (
        <Note tone="warning" className="mb-3">
          <p className="font-semibold">Bidders cannot see this lot.</p>
          <p className="mt-1">
            It is still a draft in an auction that has already been published,
            which is what happens to stock added after the auction went out.
            Publishing it puts it on the market
            {auctionQuery.data?.status === "live"
              ? " immediately"
              : " when the auction opens"}
            , and freezes its starting price and reserve against the first bid.
          </p>
          <p className="mt-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => setPublishing(true)}
            >
              Publish this lot
            </Button>
          </p>
        </Note>
      )}

      {lot.progress === "abandoned" && (
        <Note tone="danger" className="mb-3">
          <p className="font-semibold">This lot never opened.</p>
          <p className="mt-1">
            It was still a draft when its auction finished, so it can no longer
            be published and no bidder ever saw it. Relist it in another auction
            to sell the item.
          </p>
        </Note>
      )}

      {lot.progress === "waiting_for_auction_publish" && (
        <Note tone="info" className="mb-3">
          Bidders cannot see this lot yet. It goes out with the auction —
          publishing the auction takes its draft lots along, so there is nothing
          to do on the lot itself.
        </Note>
      )}

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
        bodyClassName="grid gap-4 sm:grid-cols-3 lg:grid-cols-7"
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
        <DataPoint label="Bid increment">
          {/* Null means this lot has no override and follows the auction's bands. */}
          {lot.bid_increment_minor === null ||
          lot.bid_increment_minor === undefined ? (
            <span className="text-xs text-text-muted">Auction bands</span>
          ) : (
            <span className="tnum">
              {formatMoney(lot.bid_increment_minor, currency)}
              <span className="block text-xs text-text-muted">
                this lot only
              </span>
            </span>
          )}
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
        {/* min-w-0: a grid item defaults to min-width:auto, so the bid-history
            table's intrinsic width would push this column past the viewport on
            a phone and carry the photo controls off-screen with it. */}
        <div className="flex min-w-0 flex-col gap-4">
          <LotEditForm lot={lot} currency={currency} />
          <BidHistory
            lotId={lot.id}
            auctionId={lot.auction_id}
            currency={currency}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
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

      <PublishLotDialog
        lot={publishing ? lot : null}
        auctionStatus={auctionQuery.data?.status}
        currency={currency}
        onClose={() => setPublishing(false)}
      />
    </>
  );
}
