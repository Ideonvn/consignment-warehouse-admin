"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { Note } from "@/components/ui/Feedback";
import { cancelAuction, publishAuction } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/errors";
import { useAuctionInvalidation } from "@/lib/api/queries";
import { formatDateTime } from "@/lib/format/datetime";
import { useNow } from "@/lib/ui/hooks";
import type { AuctionAdmin, LotAdminSummary } from "@/types/api";

interface Check {
  ok: boolean;
  label: string;
  detail: string;
}

export function AuctionActions({
  auction,
  lots,
}: {
  auction: AuctionAdmin;
  lots: LotAdminSummary[];
}) {
  const router = useRouter();
  const invalidate = useAuctionInvalidation();
  const nowMs = useNow(10_000);
  const [showPublish, setShowPublish] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  const startsInFuture =
    nowMs === null ? true : Date.parse(auction.starts_at) > nowMs;
  const checks: Check[] = [
    {
      ok: lots.length > 0,
      label: "Has at least one lot",
      detail:
        lots.length > 0
          ? `${lots.length} lot${lots.length === 1 ? "" : "s"} ready`
          : "Add a lot before publishing — the backend refuses an empty auction.",
    },
    {
      ok: startsInFuture,
      label: "Opens in the future",
      detail: startsInFuture
        ? `Opens ${formatDateTime(auction.starts_at)}`
        : "The opening time has already passed. Move it forward first.",
    },
    {
      ok: Date.parse(auction.ends_at) > Date.parse(auction.starts_at),
      label: "Closes after it opens",
      detail: `Closes ${formatDateTime(auction.ends_at)}`,
    },
  ];
  const canPublish = checks.every((check) => check.ok);

  const publish = useMutation({
    mutationFn: () => publishAuction(auction.id),
    onSuccess: (result) => {
      invalidate(auction.id);
      setShowPublish(false);
      toast.success(
        `"${result.name}" is scheduled. Its draft lots are now scheduled too.`,
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const cancel = useMutation({
    mutationFn: (reason: string) => cancelAuction(auction.id, reason),
    onSuccess: (result) => {
      invalidate(auction.id);
      const cancelled = result.lots_cancelled ?? 0;
      toast.success(
        `Auction cancelled${cancelled > 0 ? ` · ${cancelled} lots cancelled` : ""}. Watching bidders have been notified.`,
      );
      router.push("/auctions");
    },
  });

  const soldLots = lots.filter((lot) => lot.status === "ended_sold");
  const bidLots = lots.filter((lot) => lot.bid_count > 0);
  const cancellable =
    auction.status !== "cancelled" && auction.status !== "settled";

  return (
    <>
      {auction.status === "draft" && (
        <Button variant="primary" onClick={() => setShowPublish(true)}>
          Publish
        </Button>
      )}
      {cancellable && (
        <Button variant="danger" onClick={() => setShowCancel(true)}>
          Cancel auction
        </Button>
      )}

      <Dialog
        open={showPublish}
        onClose={() => setShowPublish(false)}
        title="Publish this auction"
        description="Publishing moves the auction to scheduled and promotes its draft lots. Bidders can see it from that moment."
        width="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPublish(false)}>
              Not yet
            </Button>
            <Button
              variant="primary"
              disabled={!canPublish}
              loading={publish.isPending}
              onClick={() => publish.mutate()}
            >
              Publish
            </Button>
          </>
        }
      >
        <ul className="flex flex-col gap-2">
          {checks.map((check) => (
            <li key={check.label} className="flex items-start gap-2">
              <span
                aria-hidden
                className={
                  check.ok
                    ? "mt-0.5 text-success-ink"
                    : "mt-0.5 text-danger"
                }
              >
                {check.ok ? "✓" : "✕"}
              </span>
              <div>
                <p className="text-sm font-medium">{check.label}</p>
                <p className="text-xs text-text-muted">{check.detail}</p>
              </div>
            </li>
          ))}
        </ul>
        {!canPublish && (
          <Note tone="warning" className="mt-3">
            Publishing is blocked until every check passes. The backend rejects
            it otherwise, so this saves you the round trip.
          </Note>
        )}
      </Dialog>

      <ConfirmDialog
        open={showCancel}
        onClose={() => setShowCancel(false)}
        title="Cancel this auction"
        tone="danger"
        confirmLabel="Cancel the auction"
        requireTypedValue={auction.name}
        typedValueLabel={`Type the auction name "${auction.name}" to confirm`}
        requireReason
        reasonHint="Required by the backend and recorded against the cancellation."
        description={
          <div className="flex flex-col gap-2">
            <p>
              Cancelling ends this auction and cascades to all of its lots.
              Bidders watching any of them are notified.
            </p>
            {bidLots.length > 0 && (
              <p>
                <strong>{bidLots.length}</strong> lot
                {bidLots.length === 1 ? " has" : "s have"} bids on them right
                now. Those bids stop mattering — nothing sells.
              </p>
            )}
            {soldLots.length > 0 && (
              <p className="font-semibold text-danger-ink">
                {soldLots.length} lot{soldLots.length === 1 ? " has" : "s have"}{" "}
                already ended sold, so the backend will refuse this. Settle those
                first.
              </p>
            )}
            <p>This cannot be undone.</p>
          </div>
        }
        onConfirm={({ reason }) => cancel.mutateAsync(reason)}
      />
    </>
  );
}
