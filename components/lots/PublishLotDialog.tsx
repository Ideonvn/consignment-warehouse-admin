"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { publishLot } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/errors";
import { useLotInvalidation } from "@/lib/api/queries";
import { formatMoney } from "@/lib/format/money";
import type { AuctionStatus } from "@/types/api";

/** Everything the dialog needs, satisfied by both admin lot shapes. */
export interface PublishableLot {
  id: string;
  auction_id: string;
  lot_number: number | null;
  title: string;
  starting_price_minor: number;
  reserve_price_minor: number | null;
}

/**
 * Publishing one lot into an auction that is already out.
 *
 * Shared by the lots table and the lot detail screen so the warning is worded
 * once. It is a confirmation rather than a one-click action for a specific
 * reason, stated in the dialog: publishing exposes the lot to bidders, and the
 * first bid freezes its starting price and reserve. An operator who publishes a
 * half-entered lot cannot correct the money afterwards.
 */
export function PublishLotDialog({
  lot,
  auctionStatus,
  currency,
  onClose,
}: {
  lot: PublishableLot | null;
  auctionStatus: AuctionStatus | undefined;
  currency: string;
  onClose: () => void;
}) {
  const invalidate = useLotInvalidation();
  const goesLive = auctionStatus === "live";

  const publish = useMutation({
    mutationFn: (target: PublishableLot) => publishLot(target.id),
    onSuccess: (updated) => {
      invalidate({ id: updated.id, auction_id: updated.auction_id });
      toast.success(
        updated.status === "live"
          ? `Lot ${updated.lot_number ?? ""} is live. Bidders can bid on it now.`
          : `Lot ${updated.lot_number ?? ""} is scheduled. It opens when the auction does.`,
      );
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <ConfirmDialog
      open={lot !== null}
      onClose={onClose}
      title={goesLive ? "Publish this lot into a live auction" : "Publish this lot"}
      tone="warning"
      confirmLabel={goesLive ? "Publish — bidding opens now" : "Publish this lot"}
      description={
        lot ? (
          <div className="flex flex-col gap-2">
            <p>
              <strong>
                #{lot.lot_number ?? "—"} {lot.title}
              </strong>{" "}
              {goesLive
                ? "becomes biddable immediately — bidders can see it and bid on it the moment you confirm."
                : "joins the auction and opens with it, without waiting for anything else."}
            </p>

            <dl className="tnum grid grid-cols-2 gap-1 rounded border border-border bg-surface-sunken px-3 py-2 text-sm">
              <dt className="text-text-muted">Starting price</dt>
              <dd className="text-right">
                {formatMoney(lot.starting_price_minor, currency)}
              </dd>
              <dt className="text-text-muted">Reserve</dt>
              <dd className="text-right">
                {lot.reserve_price_minor === null
                  ? "none"
                  : formatMoney(lot.reserve_price_minor, currency)}
              </dd>
            </dl>

            <p>
              <strong>Check those two figures now.</strong> The first bid freezes
              the starting price and the reserve, and after that the only way out
              of a reserve set too high is accepting a lower bid once the lot has
              closed. Title, description and photos stay editable.
            </p>
          </div>
        ) : null
      }
      onConfirm={() => (lot ? publish.mutateAsync(lot) : undefined)}
    />
  );
}
