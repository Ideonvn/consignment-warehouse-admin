"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import { Panel } from "@/components/ui/Panel";
import { voidBid } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/errors";
import { useLotBids } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { formatDateTimeSeconds } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import { BID_STATUS_LABEL } from "@/lib/format/status";
import { cn } from "@/lib/utils";
import type { Bid } from "@/types/api";

export function BidHistory({
  lotId,
  auctionId,
  currency,
}: {
  lotId: string;
  auctionId: string;
  currency: string;
}) {
  const client = useQueryClient();
  const { data, isPending } = useLotBids(lotId);
  const [voiding, setVoiding] = useState<Bid | null>(null);

  const bids = data?.items ?? [];

  const mutation = useMutation({
    mutationFn: ({ bid, reason }: { bid: Bid; reason: string }) =>
      voidBid(bid.id, reason),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: queryKeys.lotBids(lotId) });
      void client.invalidateQueries({ queryKey: queryKeys.lot(lotId) });
      void client.invalidateQueries({ queryKey: queryKeys.lots(auctionId) });
      void client.invalidateQueries({ queryKey: queryKeys.decisionsRoot });
      toast.success(
        `Bid voided. The lot now stands at ${formatMoney(
          result.current_bid_minor,
          currency,
          { emptyAs: "no bids" },
        )} with ${result.bid_count} bid${result.bid_count === 1 ? "" : "s"}.`,
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  /** Best guess at the resulting price, shown before confirming. */
  function priceAfterVoiding(bid: Bid): number | null {
    const remaining = bids.filter(
      (other) => other.id !== bid.id && other.status !== "void",
    );
    if (remaining.length === 0) return null;
    return Math.max(...remaining.map((other) => other.amount_minor));
  }

  return (
    <Panel
      title="Bid history"
      description={
        data?.hasMore
          ? "Newest first. Older bids beyond the first page are not shown."
          : "Newest first."
      }
    >
      {isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : bids.length === 0 ? (
        <EmptyState
          title="No bids yet"
          description="Nothing has been bid on this lot."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken">
              <tr>
                <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                  Seq
                </th>
                <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                  Amount
                </th>
                <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                  Bidder
                </th>
                <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                  Status
                </th>
                <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                  Placed
                </th>
                <th className="w-20 px-2.5 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {bids.map((bid) => (
                <tr
                  key={bid.id}
                  className={cn(
                    "border-t border-border",
                    bid.status === "void" && "text-text-muted line-through",
                  )}
                >
                  <td className="tnum px-2.5 py-1.5 text-text-muted">
                    {bid.sequence}
                  </td>
                  <td className="tnum px-2.5 py-1.5 text-right font-medium">
                    {formatMoney(bid.amount_minor, currency)}
                  </td>
                  <td className="px-2.5 py-1.5">
                    {bid.bidder_handle ?? "Unknown"}
                    {bid.is_auto && (
                      <span
                        className="ml-1.5 rounded bg-surface-sunken px-1 text-[10px] text-text-muted"
                        title="Placed automatically by the bidder's maximum"
                      >
                        auto
                      </span>
                    )}
                  </td>
                  <td className="px-2.5 py-1.5 text-xs">
                    {BID_STATUS_LABEL[bid.status] ?? bid.status}
                  </td>
                  <td className="tnum px-2.5 py-1.5 text-xs text-text-muted">
                    {formatDateTimeSeconds(bid.created_at)}
                  </td>
                  <td className="px-2.5 py-1.5 text-right">
                    {bid.status !== "void" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger-ink"
                        onClick={() => setVoiding(bid)}
                      >
                        Void
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={voiding !== null}
        onClose={() => setVoiding(null)}
        title="Void this bid"
        tone="danger"
        confirmLabel="Void the bid"
        requireTypedValue={
          voiding ? formatMoney(voiding.amount_minor, currency) : null
        }
        typedValueLabel={
          voiding
            ? `Type the bid amount "${formatMoney(voiding.amount_minor, currency)}" to confirm`
            : undefined
        }
        requireReason
        reasonHint="Required. This rewrites a financial record, so say why."
        description={
          voiding ? (
            <div className="flex flex-col gap-2">
              <p>
                Voiding <strong>{formatMoney(voiding.amount_minor, currency)}</strong>{" "}
                from <strong>{voiding.bidder_handle ?? "an unknown bidder"}</strong>,
                placed {formatDateTimeSeconds(voiding.created_at)}
                {voiding.is_auto ? " automatically" : ""}.
              </p>
              <p>
                The backend recalculates the lot&apos;s leader and price from the
                remaining live bids. On the bids loaded here, the price would
                fall back to{" "}
                <strong>
                  {formatMoney(priceAfterVoiding(voiding), currency, {
                    emptyAs: "no bids at all",
                  })}
                </strong>
                .
              </p>
              <p>This cannot be undone.</p>
            </div>
          ) : null
        }
        onConfirm={({ reason }) =>
          voiding ? mutation.mutateAsync({ bid: voiding, reason }) : undefined
        }
      />
    </Panel>
  );
}
