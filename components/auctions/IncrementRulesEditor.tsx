"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState, Note } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { formatMoney } from "@/lib/format/money";
import {
  describeBands,
  incrementAtPrice,
  type IncrementBand,
} from "@/lib/format/increments";

export interface IncrementRulesEditorProps {
  bands: IncrementBand[];
  currency?: string;
  /** Rules are inherited from the global set when the auction has none. */
  usingGlobalFallback: boolean;
  onAdd: (band: {
    minPriceMinor: number;
    incrementMinor: number;
  }) => Promise<unknown> | void;
  onDelete: (band: IncrementBand) => Promise<unknown> | void;
  disabled?: boolean;
  disabledReason?: string;
  busy?: boolean;
}

/**
 * Increments are price-banded: the rule with the largest floor at or below the
 * current price wins. That is not obvious, so the table is always accompanied
 * by the plain-language reading of it.
 */
export function IncrementRulesEditor({
  bands,
  currency = "ZAR",
  usingGlobalFallback,
  onAdd,
  onDelete,
  disabled = false,
  disabledReason,
  busy = false,
}: IncrementRulesEditorProps) {
  const [minPrice, setMinPrice] = useState<number | null>(0);
  const [increment, setIncrement] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingLast, setConfirmingLast] = useState<IncrementBand | null>(
    null,
  );

  const sorted = [...bands].sort((a, b) => a.minPriceMinor - b.minPriceMinor);
  const ownRules = sorted.filter((band) => !band.isGlobal);

  async function handleAdd() {
    if (minPrice === null || minPrice < 0) {
      setError("Set the price this band starts from (0 for the first band)");
      return;
    }
    if (increment === null || increment <= 0) {
      setError("The increment must be more than zero");
      return;
    }
    if (sorted.some((band) => band.minPriceMinor === minPrice && !band.isGlobal)) {
      setError("There is already a band starting at that price");
      return;
    }
    setError(null);
    await onAdd({ minPriceMinor: minPrice, incrementMinor: increment });
    setMinPrice(null);
    setIncrement(null);
  }

  async function handleDelete(band: IncrementBand) {
    // Removing the last own rule silently restores the global fallback.
    if (ownRules.length === 1 && !band.isGlobal) {
      setConfirmingLast(band);
      return;
    }
    await onDelete(band);
  }

  return (
    <div className="flex flex-col gap-3">
      {usingGlobalFallback && (
        <Note tone="info">
          This auction has no increment rules of its own, so it uses the global
          set shown below. Add a rule here to override them for this auction
          only.
        </Note>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          title="No increment rules"
          description="Without any rules — here or globally — the backend decides the step size. Add at least one band so bidding steps are predictable."
        />
      ) : (
        <div className="overflow-hidden rounded border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken">
              <tr>
                <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                  From price
                </th>
                <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                  Bid step
                </th>
                <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                  Source
                </th>
                <th className="w-20 px-2.5 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((band) => (
                <tr
                  key={band.id ?? `${band.minPriceMinor}`}
                  className="border-t border-border"
                >
                  <td className="tnum px-2.5 py-1.5">
                    {formatMoney(band.minPriceMinor, currency)}
                  </td>
                  <td className="tnum px-2.5 py-1.5">
                    {formatMoney(band.incrementMinor, currency)}
                  </td>
                  <td className="px-2.5 py-1.5 text-xs text-text-muted">
                    {band.isGlobal ? "Global default" : "This auction"}
                  </td>
                  <td className="px-2.5 py-1.5 text-right">
                    {!band.isGlobal && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={disabled || busy}
                        onClick={() => void handleDelete(band)}
                        className="text-danger"
                      >
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="rounded border border-border bg-surface-sunken px-3 py-2 text-sm">
          <p className="mb-1 text-xs font-semibold text-text-muted">
            In plain language
          </p>
          {describeBands(sorted, currency).map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p className="mt-1 text-xs text-text-muted">
            A lot at {formatMoney(100000, currency, { decimals: false })} would
            take{" "}
            {formatMoney(incrementAtPrice(sorted, 100000), currency)}{" "}
            steps.
          </p>
        </div>
      )}

      {confirmingLast && (
        <Note tone="warning">
          <p className="font-semibold">
            That is the last rule belonging to this auction.
          </p>
          <p className="mt-1">
            Deleting it restores the global increment set, which may use
            different steps.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="danger"
              onClick={async () => {
                await onDelete(confirmingLast);
                setConfirmingLast(null);
              }}
            >
              Delete and fall back to global
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setConfirmingLast(null)}
            >
              Keep it
            </Button>
          </div>
        </Note>
      )}

      {disabled ? (
        <Note tone="info">{disabledReason}</Note>
      ) : (
        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <Field
            label="Band starts from"
            hint="0 for the opening band"
            className="w-40"
          >
            <MoneyInput
              value={minPrice}
              onChange={setMinPrice}
              currency={currency}
            />
          </Field>
          <Field label="Bid step" className="w-40">
            <MoneyInput
              value={increment}
              onChange={setIncrement}
              currency={currency}
            />
          </Field>
          <Button
            variant="secondary"
            onClick={() => void handleAdd()}
            loading={busy}
          >
            Add band
          </Button>
          {error && (
            <p role="alert" className="text-xs font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
