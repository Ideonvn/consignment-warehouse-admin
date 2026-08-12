"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DateTimeInput } from "@/components/ui/DateTimeInput";
import { Field } from "@/components/ui/Field";
import { Note } from "@/components/ui/Feedback";
import { Input, Textarea } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { PremiumField } from "./PremiumField";
import { Panel } from "@/components/ui/Panel";
import { updateAuction } from "@/lib/api/endpoints";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { useAuctionInvalidation } from "@/lib/api/queries";
import { formatDateTime } from "@/lib/format/datetime";
import type { AuctionAdmin, LotAdminSummary, UpdateAuctionInput } from "@/types/api";

/**
 * Freeze rules, mirrored from the backend so inputs are disabled up front
 * instead of the operator discovering them through a 409.
 */
function freezeReasons(auction: AuctionAdmin, anyLotHasBid: boolean) {
  const bidFreeze = anyLotHasBid
    ? "Locked: a lot in this auction already has a bid. Bidding rules cannot change under people who have bid."
    : null;
  return {
    currency_code: bidFreeze,
    anti_snipe_window_seconds: bidFreeze,
    anti_snipe_extension_seconds: bidFreeze,
    max_extensions: bidFreeze,
    deposit_amount_minor: bidFreeze,
    buyers_premium_bps: bidFreeze,
    starts_at:
      auction.status === "live"
        ? "Locked: the auction is already live, so it cannot be given a different opening time."
        : null,
  };
}

interface Draft {
  name: string;
  description: string;
  starts_at: string;
  ends_at: string;
  currency_code: string;
  anti_snipe_window_seconds: number;
  anti_snipe_extension_seconds: number;
  max_extensions: number;
  deposit_amount_minor: number;
  buyers_premium_bps: number;
}

function toDraft(auction: AuctionAdmin): Draft {
  return {
    name: auction.name,
    description: auction.description ?? "",
    starts_at: auction.starts_at,
    ends_at: auction.ends_at,
    currency_code: auction.currency_code,
    anti_snipe_window_seconds: auction.anti_snipe_window_seconds,
    anti_snipe_extension_seconds: auction.anti_snipe_extension_seconds,
    max_extensions: auction.max_extensions,
    deposit_amount_minor: auction.deposit_amount_minor,
    buyers_premium_bps: auction.buyers_premium_bps,
  };
}

export function AuctionEditForm({
  auction,
  lots,
}: {
  auction: AuctionAdmin;
  lots: LotAdminSummary[];
}) {
  const invalidate = useAuctionInvalidation();
  const anyLotHasBid = lots.some((lot) => lot.bid_count > 0);
  const frozen = freezeReasons(auction, anyLotHasBid);

  const [draft, setDraft] = useState<Draft>(() => toDraft(auction));
  const [lastAuction, setLastAuction] = useState(auction);
  if (auction !== lastAuction) {
    setLastAuction(auction);
    setDraft(toDraft(auction));
  }

  const [frozenField, setFrozenField] = useState<{
    field: string;
    message: string;
  } | null>(null);
  const [showEndsAtConfirm, setShowEndsAtConfirm] = useState(false);
  const [showShortenConfirm, setShowShortenConfirm] = useState(false);

  const openLots = lots.filter(
    (lot) => lot.status === "scheduled" || lot.status === "live",
  );
  const lotsWithBids = lots.filter((lot) => lot.bid_count > 0);

  const endsAtChanged = draft.ends_at !== auction.ends_at;
  const shortening =
    endsAtChanged && Date.parse(draft.ends_at) < Date.parse(auction.ends_at);
  // Any lot with a bid counts as live bidding, whether or not the auction has
  // flipped to `live` yet — a bid can land on a scheduled auction, and the
  // backend demands confirm_shorten in that case too.
  const shorteningLiveBidding = shortening && lotsWithBids.length > 0;

  function changedPatch(confirmShorten: boolean): UpdateAuctionInput {
    const patch: UpdateAuctionInput = {};
    if (draft.name !== auction.name) patch.name = draft.name;
    if (draft.description !== (auction.description ?? "")) {
      patch.description = draft.description || null;
    }
    if (!frozen.starts_at && draft.starts_at !== auction.starts_at) {
      patch.starts_at = draft.starts_at;
    }
    if (draft.ends_at !== auction.ends_at) patch.ends_at = draft.ends_at;
    if (!anyLotHasBid) {
      if (draft.currency_code !== auction.currency_code) {
        patch.currency_code = draft.currency_code;
      }
      if (draft.anti_snipe_window_seconds !== auction.anti_snipe_window_seconds) {
        patch.anti_snipe_window_seconds = draft.anti_snipe_window_seconds;
      }
      if (
        draft.anti_snipe_extension_seconds !==
        auction.anti_snipe_extension_seconds
      ) {
        patch.anti_snipe_extension_seconds = draft.anti_snipe_extension_seconds;
      }
      if (draft.max_extensions !== auction.max_extensions) {
        patch.max_extensions = draft.max_extensions;
      }
      if (draft.deposit_amount_minor !== auction.deposit_amount_minor) {
        patch.deposit_amount_minor = draft.deposit_amount_minor;
      }
      if (draft.buyers_premium_bps !== auction.buyers_premium_bps) {
        patch.buyers_premium_bps = draft.buyers_premium_bps;
      }
    }
    if (confirmShorten) patch.confirm_shorten = true;
    return patch;
  }

  const dirty = Object.keys(changedPatch(false)).length > 0;

  const mutation = useMutation({
    mutationFn: (confirmShorten: boolean) =>
      updateAuction(auction.id, changedPatch(confirmShorten)),
    onSuccess: (result) => {
      invalidate(auction.id);
      setFrozenField(null);
      const moved = result.lots_rescheduled ?? 0;
      const cancelled = result.lots_cancelled ?? 0;
      const parts = ["Auction updated"];
      if (moved > 0) parts.push(`${moved} lot${moved === 1 ? "" : "s"} rescheduled`);
      if (cancelled > 0) {
        parts.push(`${cancelled} lot${cancelled === 1 ? "" : "s"} cancelled`);
      }
      toast.success(parts.join(" · "));
    },
    onError: (error) => {
      if (isApiError(error) && error.kind === "frozen_field" && error.field) {
        setFrozenField({ field: error.field, message: error.detail });
        toast.error(`${error.field} cannot be changed: ${error.detail}`);
      } else {
        toast.error(errorMessage(error));
      }
    },
  });

  function submit() {
    if (shorteningLiveBidding) {
      setShowShortenConfirm(true);
      return;
    }
    if (endsAtChanged && openLots.length > 0) {
      setShowEndsAtConfirm(true);
      return;
    }
    mutation.mutate(false);
  }

  function fieldError(field: keyof Draft) {
    return frozenField?.field === field ? frozenField.message : undefined;
  }

  return (
    <>
      <Panel
        title="Edit auction"
        description={
          anyLotHasBid
            ? "Some fields are locked because bidding has started."
            : "Nothing is locked yet — no lot in this auction has a bid."
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="a-name" error={fieldError("name")}>
              <Input
                id="a-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>

            <Field
              label="Slug"
              hint="The slug cannot be changed after creation."
              frozenReason="Locked: bidder links already point at this slug."
            >
              <Input value={auction.slug} disabled className="font-mono" />
            </Field>
          </div>

          <Field label="Description" htmlFor="a-desc">
            <Textarea
              id="a-desc"
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Opens"
              frozenReason={frozen.starts_at}
              error={fieldError("starts_at")}
            >
              <DateTimeInput
                value={draft.starts_at}
                disabled={Boolean(frozen.starts_at)}
                onChange={(iso) =>
                  setDraft({ ...draft, starts_at: iso ?? draft.starts_at })
                }
              />
            </Field>

            <Field
              label="Closes"
              error={fieldError("ends_at")}
              hint="Moving this moves every lot that has not ended, keeping each lot's earned anti-snipe extensions."
            >
              <DateTimeInput
                value={draft.ends_at}
                onChange={(iso) =>
                  setDraft({ ...draft, ends_at: iso ?? draft.ends_at })
                }
              />
            </Field>
          </div>

          {endsAtChanged && openLots.length > 0 && (
            <Note tone={shortening ? "warning" : "info"}>
              <p className="font-semibold">
                {openLots.length} lot{openLots.length === 1 ? "" : "s"} will move
                with this change.
              </p>
              <p className="mt-1">
                From {formatDateTime(auction.ends_at)} to{" "}
                {formatDateTime(draft.ends_at)}. Each lot keeps the extensions it
                has already earned, applied as a delta on top of the new time.
              </p>
              {shortening && lotsWithBids.length > 0 && (
                <p className="mt-1 font-semibold">
                  {lotsWithBids.length} of them already have bids. Shortening
                  truncates bidding people are in the middle of.
                </p>
              )}
            </Note>
          )}

          <div className="grid gap-3 sm:grid-cols-4">
            <Field
              label="Currency"
              frozenReason={frozen.currency_code}
              error={fieldError("currency_code")}
            >
              <Input
                value={draft.currency_code}
                disabled={Boolean(frozen.currency_code)}
                maxLength={3}
                className="uppercase"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    currency_code: e.target.value.toUpperCase(),
                  })
                }
              />
            </Field>

            <Field
              label="Anti-snipe window (s)"
              frozenReason={frozen.anti_snipe_window_seconds}
              error={fieldError("anti_snipe_window_seconds")}
            >
              <Input
                type="number"
                min={0}
                className="tnum"
                value={draft.anti_snipe_window_seconds}
                disabled={Boolean(frozen.anti_snipe_window_seconds)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    anti_snipe_window_seconds: Number(e.target.value),
                  })
                }
              />
            </Field>

            <Field
              label="Extension (s)"
              frozenReason={frozen.anti_snipe_extension_seconds}
              error={fieldError("anti_snipe_extension_seconds")}
            >
              <Input
                type="number"
                min={0}
                className="tnum"
                value={draft.anti_snipe_extension_seconds}
                disabled={Boolean(frozen.anti_snipe_extension_seconds)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    anti_snipe_extension_seconds: Number(e.target.value),
                  })
                }
              />
            </Field>

            <Field
              label="Max extensions"
              frozenReason={frozen.max_extensions}
              error={fieldError("max_extensions")}
            >
              <Input
                type="number"
                min={0}
                className="tnum"
                value={draft.max_extensions}
                disabled={Boolean(frozen.max_extensions)}
                onChange={(e) =>
                  setDraft({ ...draft, max_extensions: Number(e.target.value) })
                }
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Bidder deposit"
              frozenReason={frozen.deposit_amount_minor}
              error={fieldError("deposit_amount_minor")}
              hint="What someone must hold in credit before they can bid here. Zero means no deposit."
            >
              <MoneyInput
                value={draft.deposit_amount_minor}
                currency={draft.currency_code || auction.currency_code}
                disabled={Boolean(frozen.deposit_amount_minor)}
                onChange={(minor) =>
                  setDraft({ ...draft, deposit_amount_minor: minor ?? 0 })
                }
              />
            </Field>

            <PremiumField
              bps={draft.buyers_premium_bps}
              frozenReason={frozen.buyers_premium_bps}
              error={fieldError("buyers_premium_bps")}
              onChange={(bps) => setDraft({ ...draft, buyers_premium_bps: bps })}
            />
          </div>

          <div className="flex items-center gap-2 border-t border-border pt-3">
            <Button
              variant="primary"
              disabled={!dirty}
              loading={mutation.isPending}
              onClick={submit}
            >
              Save changes
            </Button>
            <Button
              variant="ghost"
              disabled={!dirty}
              onClick={() => setDraft(toDraft(auction))}
            >
              Discard
            </Button>
            {!dirty && (
              <span className="text-xs text-text-muted">No changes yet.</span>
            )}
          </div>
        </div>
      </Panel>

      <ConfirmDialog
        open={showEndsAtConfirm}
        onClose={() => setShowEndsAtConfirm(false)}
        title="Move the closing time?"
        tone="warning"
        confirmLabel="Move the closing time"
        description={
          <div className="flex flex-col gap-2">
            <p>
              {openLots.length} lot{openLots.length === 1 ? "" : "s"} that have
              not ended will move with the auction, from{" "}
              <strong>{formatDateTime(auction.ends_at)}</strong> to{" "}
              <strong>{formatDateTime(draft.ends_at)}</strong>.
            </p>
            <p>
              Extensions already earned by a lot are preserved as a delta, so a
              lot that had been pushed out stays pushed out relative to the new
              close.
            </p>
            {lotsWithBids.length > 0 && (
              <p>
                {lotsWithBids.length} of those lots have live bids. Watching
                bidders are notified of the new time.
              </p>
            )}
          </div>
        }
        onConfirm={() => mutation.mutateAsync(false)}
      />

      <ConfirmDialog
        open={showShortenConfirm}
        onClose={() => setShowShortenConfirm(false)}
        title="Cut short an auction people are bidding in"
        tone="danger"
        confirmLabel="Shorten the auction"
        requireTypedValue={auction.name}
        typedValueLabel={`Type the auction name "${auction.name}" to confirm`}
        description={
          <div className="flex flex-col gap-2">
            <p>
              You are pulling the close from{" "}
              <strong>{formatDateTime(auction.ends_at)}</strong> back to{" "}
              <strong>{formatDateTime(draft.ends_at)}</strong>.
            </p>
            <p>
              <strong>{lotsWithBids.length}</strong> lot
              {lotsWithBids.length === 1 ? " has" : "s have"} live bids, and{" "}
              <strong>{openLots.length}</strong> lot
              {openLots.length === 1 ? "" : "s"} will be truncated. Bidders who
              were planning to bid before the original close lose that chance,
              and they are notified.
            </p>
            <p>This cannot be undone by moving the time back.</p>
          </div>
        }
        onConfirm={() => mutation.mutateAsync(true)}
      />
    </>
  );
}
