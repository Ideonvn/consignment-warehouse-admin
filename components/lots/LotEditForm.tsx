"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { DateTimeInput } from "@/components/ui/DateTimeInput";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Panel } from "@/components/ui/Panel";
import { updateLot } from "@/lib/api/endpoints";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { useLotInvalidation } from "@/lib/api/queries";
import type { LotAdminDetail, UpdateLotInput } from "@/types/api";

const BID_FREEZE =
  "Locked: this lot already has a bid, so its money and timing cannot move under the people who bid.";

const RESERVE_FREEZE =
  "Locked: the reserve is fixed once a lot has a bid. If it turned out too high, let the lot close and use Accept reserve on the top bid — that is the intended escape hatch, not moving the reserve mid-auction.";

interface Draft {
  title: string;
  description: string;
  startingPriceMinor: number | null;
  overrideIncrement: boolean;
  incrementMinor: number | null;
  reservePriceMinor: number | null;
  scheduledEndsAt: string | null;
  effectiveEndsAt: string | null;
}

function toDraft(lot: LotAdminDetail): Draft {
  return {
    title: lot.title,
    description: lot.description ?? "",
    startingPriceMinor: lot.starting_price_minor,
    overrideIncrement:
      lot.bid_increment_minor !== null && lot.bid_increment_minor !== undefined,
    incrementMinor: lot.bid_increment_minor ?? null,
    reservePriceMinor: lot.reserve_price_minor,
    scheduledEndsAt: lot.scheduled_ends_at,
    effectiveEndsAt: lot.effective_ends_at,
  };
}

export function LotEditForm({
  lot,
  currency,
}: {
  lot: LotAdminDetail;
  currency: string;
}) {
  const invalidate = useLotInvalidation();
  const frozen = lot.bid_count > 0;

  const [draft, setDraft] = useState<Draft>(() => toDraft(lot));
  const [lastLot, setLastLot] = useState(lot);
  if (lot !== lastLot) {
    setLastLot(lot);
    setDraft(toDraft(lot));
  }

  const [frozenField, setFrozenField] = useState<{
    field: string;
    message: string;
  } | null>(null);

  function patch(): UpdateLotInput {
    const next: UpdateLotInput = {};
    if (draft.title !== lot.title) next.title = draft.title;
    if (draft.description !== (lot.description ?? "")) {
      next.description = draft.description || null;
    }
    if (frozen) return next;

    if (draft.startingPriceMinor !== lot.starting_price_minor) {
      next.starting_price_minor = draft.startingPriceMinor ?? 0;
    }
    const incrementNow = draft.overrideIncrement ? draft.incrementMinor : null;
    if (incrementNow !== (lot.bid_increment_minor ?? null)) {
      next.bid_increment_minor = incrementNow;
    }
    if (draft.reservePriceMinor !== lot.reserve_price_minor) {
      next.reserve_price_minor = draft.reservePriceMinor;
    }
    if (draft.scheduledEndsAt && draft.scheduledEndsAt !== lot.scheduled_ends_at) {
      next.scheduled_ends_at = draft.scheduledEndsAt;
    }
    if (draft.effectiveEndsAt && draft.effectiveEndsAt !== lot.effective_ends_at) {
      next.effective_ends_at = draft.effectiveEndsAt;
    }
    return next;
  }

  const dirty = Object.keys(patch()).length > 0;

  const mutation = useMutation({
    mutationFn: () => updateLot(lot.id, patch()),
    onSuccess: () => {
      invalidate(lot);
      setFrozenField(null);
      toast.success("Lot updated");
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

  const fieldError = (field: string) =>
    frozenField?.field === field ? frozenField.message : undefined;

  return (
    <Panel
      title="Edit lot"
      description={
        frozen
          ? `This lot has ${lot.bid_count} bid${lot.bid_count === 1 ? "" : "s"}, so its money and timing are locked. Title, description and photos stay editable.`
          : "No bids yet, so everything is still editable."
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Title" htmlFor="lot-title" error={fieldError("title")}>
          <Input
            id="lot-title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </Field>

        <Field label="Description" htmlFor="lot-description">
          <Textarea
            id="lot-description"
            rows={4}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Starting price"
            frozenReason={frozen ? BID_FREEZE : null}
            error={fieldError("starting_price_minor")}
          >
            <MoneyInput
              value={draft.startingPriceMinor}
              currency={currency}
              disabled={frozen}
              onChange={(minor) =>
                setDraft({ ...draft, startingPriceMinor: minor })
              }
            />
          </Field>

          <Field
            label="Reserve"
            frozenReason={frozen ? RESERVE_FREEZE : null}
            hint="Never shown to bidders."
            error={fieldError("reserve_price_minor")}
          >
            <MoneyInput
              value={draft.reservePriceMinor}
              currency={currency}
              disabled={frozen}
              onChange={(minor) =>
                setDraft({ ...draft, reservePriceMinor: minor })
              }
            />
          </Field>
        </div>

        <fieldset
          className="flex flex-col gap-2 rounded border border-border px-3 py-2 disabled:opacity-60"
          disabled={frozen}
        >
          <legend className="px-1 text-xs font-medium">Bid increment</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="lot-increment-mode"
              checked={!draft.overrideIncrement}
              disabled={frozen}
              onChange={() => setDraft({ ...draft, overrideIncrement: false })}
            />
            Use the auction&apos;s increment bands
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="lot-increment-mode"
              checked={draft.overrideIncrement}
              disabled={frozen}
              onChange={() => setDraft({ ...draft, overrideIncrement: true })}
            />
            Override for this lot
          </label>
          {draft.overrideIncrement && (
            <div className="w-44 pl-6">
              <MoneyInput
                value={draft.incrementMinor}
                currency={currency}
                disabled={frozen}
                onChange={(minor) => setDraft({ ...draft, incrementMinor: minor })}
              />
            </div>
          )}
          {frozen && <p className="text-xs text-text-muted">{BID_FREEZE}</p>}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Scheduled close"
            frozenReason={frozen ? BID_FREEZE : null}
            hint="The close this lot inherited from the auction."
            error={fieldError("scheduled_ends_at")}
          >
            <DateTimeInput
              value={draft.scheduledEndsAt}
              disabled={frozen}
              onChange={(iso) => setDraft({ ...draft, scheduledEndsAt: iso })}
            />
          </Field>

          <Field
            label="Effective close"
            frozenReason={frozen ? BID_FREEZE : null}
            hint="Scheduled close plus any anti-snipe extensions this lot has earned."
            error={fieldError("effective_ends_at")}
          >
            <DateTimeInput
              value={draft.effectiveEndsAt}
              disabled={frozen}
              onChange={(iso) => setDraft({ ...draft, effectiveEndsAt: iso })}
            />
          </Field>
        </div>

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Button
            variant="primary"
            disabled={!dirty}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Save changes
          </Button>
          <Button
            variant="ghost"
            disabled={!dirty}
            onClick={() => setDraft(toDraft(lot))}
          >
            Discard
          </Button>
          {!dirty && (
            <span className="text-xs text-text-muted">No changes yet.</span>
          )}
        </div>
      </div>
    </Panel>
  );
}
