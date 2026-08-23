"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CopyLinkButton } from "@/components/ui/CopyLinkButton";
import { Note } from "@/components/ui/Feedback";
import { Panel } from "@/components/ui/Panel";
import { updateAuction } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/errors";
import { useAuctionInvalidation } from "@/lib/api/queries";
import { publicAuctionUrl } from "@/lib/config/bidder-app";
import type { AuctionAdmin, AuctionVisibility as Visibility, LotAdminSummary } from "@/types/api";
import { GlobeIcon } from "./VisibilityMark";

/**
 * Who can see this auction.
 *
 * **Outside `AuctionEditForm` on purpose**, for the same reason the cover image
 * is: that component is where the freeze rules live, and visibility is not a
 * frozen field. Bidding rules lock once any lot has a bid; visibility stays
 * changeable at any time, including mid-auction, because an operator who
 * published by mistake must be able to unpublish. Putting it inside would also
 * queue an instant, consequential decision behind the form's "Save changes"
 * dirty-check, alongside fields that cannot move.
 *
 * Not optimistic: it waits for the server and shows the server's answer, like
 * everything here that is not photo ordering.
 */
export function AuctionVisibility({
  auction,
  lots,
}: {
  auction: AuctionAdmin;
  lots: LotAdminSummary[];
}) {
  const invalidate = useAuctionInvalidation();
  const [confirming, setConfirming] = useState(false);

  const isPublic = auction.visibility === "public";
  const lotsWithBids = lots.filter((lot) => lot.bid_count > 0).length;

  // Going private is only consequential once people can actually be looking:
  // a live auction that has bids has anonymous browsers and shared links out in
  // the world. A draft nobody could reach has neither.
  const goingPrivateStrands =
    isPublic && auction.status === "live" && lotsWithBids > 0;

  const change = useMutation({
    mutationFn: (visibility: Visibility) =>
      updateAuction(auction.id, { visibility }),
    onSuccess: (updated) => {
      invalidate(auction.id);
      setConfirming(false);
      toast.success(
        updated.visibility === "public"
          ? "Auction is public. Anyone with the link can browse it."
          : "Auction is private. Links already shared have stopped working.",
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function toggle() {
    if (goingPrivateStrands) {
      setConfirming(true);
      return;
    }
    change.mutate(isPublic ? "private" : "public");
  }

  return (
    <Panel
      title="Visibility"
      description="Who can see this auction. Not frozen by bidding — changeable at any time."
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              isPublic
                ? "inline-flex items-center gap-1.5 text-sm font-medium text-text"
                : "inline-flex items-center gap-1.5 text-sm font-medium text-text-muted"
            }
          >
            <GlobeIcon />
            {isPublic ? "Public" : "Private"}
          </span>
          <span className="text-xs text-text-muted">
            {isPublic
              ? auction.status === "draft"
                ? "Set to public, but a draft is not on the public site until it is published."
                : "Anyone can browse the lots, photos, descriptions and the current top bid without an account. Bidding still needs one."
              : "Only signed-in staff can see it. To a visitor it is indistinguishable from an auction that does not exist."}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button
            variant={isPublic ? "secondary" : "primary"}
            loading={change.isPending}
            onClick={toggle}
          >
            {isPublic ? "Make private" : "Make public"}
          </Button>

          {/* Only for a public auction: a private auction's link goes nowhere. */}
          {isPublic && (
            <>
              <CopyLinkButton
                url={publicAuctionUrl(auction.id)}
                label="Copy public link"
                size="md"
              />
              <span className="truncate font-mono text-xs text-text-muted">
                {publicAuctionUrl(auction.id)}
              </span>
            </>
          )}
        </div>

        {/*
          Verified against the running API rather than assumed: a DRAFT auction
          marked public still 404s anonymously, while an ended one returns 200.
          Publishing is a separate gate, so saying "anyone can browse it" on a
          draft would be a promise the API does not keep.
        */}
        {isPublic && auction.status === "draft" && (
          <Note tone="warning">
            Marked public, but nobody can reach it yet — a draft is not on the
            public site whatever its visibility. It becomes browsable when you
            publish the auction.
          </Note>
        )}

        {!isPublic && auction.status === "live" && (
          <Note tone="info">
            This auction is live but private, so nobody outside the team can
            reach it. Bidders who already have accounts can still bid; anonymous
            visitors get nothing.
          </Note>
        )}
      </div>

      {/*
        Going private on a live auction with bids gets a dialog, because it is
        the one direction with consequences the operator cannot see from here.
        No type-to-confirm and no reason field: those belong to cancel-auction
        and void-bid, which are irreversible and touch money. This is reversible
        in one click and touches nothing, and ceremony out of proportion to risk
        is how operators learn to click through ceremonies.
      */}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Make this auction private?"
        tone="warning"
        confirmLabel="Make it private"
        description={
          <div className="flex flex-col gap-2">
            <p>
              <strong>{auction.name}</strong> is live and has bids on{" "}
              {lotsWithBids} {lotsWithBids === 1 ? "lot" : "lots"}. Making it
              private takes it off the public site immediately.
            </p>
            <ul className="list-disc pl-5">
              <li>
                <strong>Links already shared stop working.</strong> A lot posted
                into a WhatsApp group will no longer open.
              </li>
              <li>
                <strong>Anyone browsing it right now loses access</strong>{" "}
                mid-visit, with no explanation — a private auction is
                indistinguishable from one that never existed, which is the
                point of private.
              </li>
              <li>
                Bids already placed are untouched, and signed-in bidders can
                carry on.
              </li>
            </ul>
            <p>You can make it public again at any time, in one click.</p>
          </div>
        }
        onConfirm={() => change.mutateAsync("private")}
      />
    </Panel>
  );
}
