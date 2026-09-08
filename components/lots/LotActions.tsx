"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Note } from "@/components/ui/Feedback";
import { Select } from "@/components/ui/Input";
import {
  acceptReserve,
  deleteLot,
  relistLot,
  withdrawLot,
} from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/errors";
import { useAuctions, useLotInvalidation } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { formatMoney } from "@/lib/format/money";
import type { LotAdminDetail } from "@/types/api";

export function LotActions({
  lot,
  currency,
}: {
  lot: LotAdminDetail;
  currency: string;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const invalidate = useLotInvalidation();

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showAccept, setShowAccept] = useState(false);
  const [showRelist, setShowRelist] = useState(false);

  const hasBids = lot.bid_count > 0;
  const canDelete = lot.status === "draft" && !hasBids;
  const canWithdraw = !["withdrawn", "cancelled", "ended_sold"].includes(
    lot.status,
  );
  const canAcceptReserve = lot.status === "ended_reserve_not_met";
  const canRelist = [
    "ended_unsold",
    "ended_reserve_not_met",
    "withdrawn",
  ].includes(lot.status);

  const withdraw = useMutation({
    mutationFn: (reason: string) => withdrawLot(lot.id, reason),
    onSuccess: () => {
      invalidate(lot);
      toast.success("Lot withdrawn. Watching bidders have been notified.");
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteLot(lot.id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.lots(lot.auction_id) });
      toast.success("Lot deleted.");
      router.push(`/auctions/${lot.auction_id}?tab=lots`);
    },
  });

  const accept = useMutation({
    mutationFn: (reason: string) => acceptReserve(lot.id, reason),
    onSuccess: () => {
      invalidate(lot);
      toast.success("Top bid accepted. The lot is now sold.");
    },
  });

  return (
    <>
      {canAcceptReserve && (
        <Button variant="primary" onClick={() => setShowAccept(true)}>
          Accept reserve
        </Button>
      )}
      {canRelist && (
        <Button variant="secondary" onClick={() => setShowRelist(true)}>
          Relist
        </Button>
      )}
      {canWithdraw && (
        <Button variant="danger" onClick={() => setShowWithdraw(true)}>
          Withdraw
        </Button>
      )}
      {canDelete && (
        <Button variant="secondary" onClick={() => setShowDelete(true)}>
          Delete
        </Button>
      )}

      <ConfirmDialog
        open={showWithdraw}
        onClose={() => setShowWithdraw(false)}
        title="Withdraw this lot"
        tone="danger"
        confirmLabel="Withdraw the lot"
        requireReason
        reasonHint="Required by the backend and recorded against the withdrawal."
        description={
          <div className="flex flex-col gap-2">
            <p>
              The lot is pulled out of the auction and can no longer be bid on.
            </p>
            {hasBids ? (
              <p>
                It already has <strong>{lot.bid_count}</strong> bid
                {lot.bid_count === 1 ? "" : "s"}, currently at{" "}
                <strong>{formatMoney(lot.current_bid_minor, currency)}</strong>.
                That bid history stands as a record, automatic bids are
                deactivated, and everyone watching this lot is notified that it
                was withdrawn.
              </p>
            ) : (
              <p>No one has bid on it, so nobody is affected.</p>
            )}
            <p>You can relist a withdrawn lot into another auction later.</p>
          </div>
        }
        onConfirm={({ reason }) => withdraw.mutateAsync(reason)}
      />

      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        title="Delete this lot"
        tone="danger"
        confirmLabel="Delete permanently"
        description={
          <div className="flex flex-col gap-2">
            <p>
              This lot is still a draft with no bids, so it can be deleted
              outright. Nothing about it is kept — use Withdraw instead if you
              want the record.
            </p>
          </div>
        }
        onConfirm={() => remove.mutateAsync()}
      />

      <ConfirmDialog
        open={showAccept}
        onClose={() => setShowAccept(false)}
        title="Sell below the reserve"
        tone="warning"
        confirmLabel="Accept the top bid"
        requireReason
        reasonHint="Required. Recorded against the decision to sell under reserve."
        description={
          <div className="flex flex-col gap-2">
            <p>
              This lot closed below its reserve. Accepting promotes the top bid
              to won and marks the lot sold.
            </p>
            <dl className="tnum grid grid-cols-2 gap-1 rounded border border-border bg-surface-sunken px-3 py-2">
              <dt className="text-text-muted">Reserve</dt>
              <dd className="text-right">
                {formatMoney(lot.reserve_price_minor, currency)}
              </dd>
              <dt className="text-text-muted">Top bid</dt>
              <dd className="text-right">
                {formatMoney(lot.current_bid_minor, currency)}
              </dd>
              <dt className="font-semibold text-warning-ink">Shortfall</dt>
              <dd className="text-right font-semibold text-warning-ink">
                {formatMoney(
                  Math.max(
                    (lot.reserve_price_minor ?? 0) - (lot.current_bid_minor ?? 0),
                    0,
                  ),
                  currency,
                )}
              </dd>
            </dl>
            <p>You are knowingly selling for less than the reserve.</p>
          </div>
        }
        onConfirm={({ reason }) => accept.mutateAsync(reason)}
      />

      <RelistDialog
        open={showRelist}
        onClose={() => setShowRelist(false)}
        lot={lot}
      />
    </>
  );
}

export function RelistDialog({
  open,
  onClose,
  lot,
}: {
  open: boolean;
  onClose: () => void;
  /** Only identity is needed, so the decisions queue can reuse this. */
  lot: { id: string; auction_id: string };
}) {
  const router = useRouter();
  const client = useQueryClient();
  const { data: auctions } = useAuctions({ limit: 200 });
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Relisted lots arrive as drafts, so only auctions that can still take a
  // draft are worth offering.
  const targets = (auctions ?? []).filter(
    (auction) =>
      (auction.status === "draft" || auction.status === "scheduled") &&
      auction.id !== lot.auction_id,
  );
  const sameAuction = (auctions ?? []).filter(
    (auction) => auction.id === lot.auction_id && auction.status === "draft",
  );
  const options = [...sameAuction, ...targets];

  const relist = useMutation({
    mutationFn: () =>
      relistLot(lot.id, { target_auction_id: targetId, lot_number: null }),
    onSuccess: (created) => {
      void client.invalidateQueries({ queryKey: queryKeys.lots(lot.auction_id) });
      void client.invalidateQueries({
        queryKey: queryKeys.lots(created.auction_id),
      });
      void client.invalidateQueries({ queryKey: queryKeys.decisionsRoot });
      toast.success(`Relisted as lot ${created.lot_number ?? ""}.`);
      onClose();
      router.push(`/lots/${created.id}`);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Relist this lot"
      description="A fresh draft lot is created in the target auction."
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!targetId}
            loading={relist.isPending}
            onClick={() => relist.mutate()}
          >
            Relist
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Note tone="info">
          The title, description, prices and images are copied. Bids, automatic
          bids, extension counts and the current price are not — the new
          lot starts clean, and links back to this one.
        </Note>

        <Field
          label="Target auction"
          required
          error={error}
          hint={
            options.length === 0
              ? "No draft or scheduled auction to relist into. Create one first."
              : "Only draft and scheduled auctions can take a new draft lot."
          }
        >
          <Select
            value={targetId}
            onChange={(event) => {
              setTargetId(event.target.value);
              setError(null);
            }}
          >
            <option value="">Choose an auction…</option>
            {options.map((auction) => (
              <option key={auction.id} value={auction.id}>
                {auction.name} ({auction.status})
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}
