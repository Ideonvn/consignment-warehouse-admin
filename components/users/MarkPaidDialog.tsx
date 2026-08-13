"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Note } from "@/components/ui/Feedback";
import { createLedgerEntry } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/errors";
import { formatRelative } from "@/lib/format/datetime";
import { describeBalance } from "@/lib/format/ledger";
import { formatMoney } from "@/lib/format/money";
import type { Outstanding } from "@/types/api";

/**
 * Settle someone's balance from the outstanding list.
 *
 * There is no "mark as paid" endpoint and there should not be one: this posts an
 * ordinary `payment` entry through the same write path as every other entry, so
 * the settlement carries its own amount and reference and can be reversed like
 * anything else.
 *
 * The amount and reference are **editable**. A bank line rarely matches the
 * balance to the cent — someone pays a round number, or pays for two things at
 * once — and a one-click button beside a list of names is exactly how the wrong
 * person gets credited. The dialog says what will be posted and what the balance
 * becomes before anything is written.
 */
export function MarkPaidDialog({
  row,
  onClose,
  onPosted,
}: {
  row: Outstanding | null;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [amount, setAmount] = useState<number | null>(null);
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reconciled during render so each opening starts from that person's figures
  // rather than whatever the last one left behind.
  const [lastRowId, setLastRowId] = useState<string | null>(null);
  const rowId = row?.user_id ?? null;
  if (rowId !== lastRowId) {
    setLastRowId(rowId);
    setAmount(row?.amount_owing_minor ?? null);
    setReference(row?.payment_reference ?? "");
    setError(null);
  }

  const currency = row?.currency_code ?? "ZAR";
  const name = row
    ? [row.first_name, row.last_name].filter(Boolean).join(" ") || row.handle
    : "";

  const post = useMutation({
    mutationFn: () =>
      createLedgerEntry(row!.user_id, {
        entry_type: "payment",
        amount_minor: amount!,
        reference: reference.trim() || null,
        description: null,
      }),
    onSuccess: () => {
      toast.success(
        `Payment of ${formatMoney(amount, currency)} recorded against ${name}.`,
      );
      onPosted();
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function confirm() {
    if (amount === null || amount <= 0) {
      setError("Enter an amount greater than zero");
      return;
    }
    setError(null);
    post.mutate();
  }

  // A payment adds credit, so it moves a negative balance towards zero.
  const after = row ? describeBalance(row.balance_minor + (amount ?? 0), currency) : null;
  const overpaying = row !== null && (amount ?? 0) > row.amount_owing_minor;

  return (
    <Dialog
      open={row !== null}
      onClose={onClose}
      title="Record a payment"
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={post.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={confirm}
            loading={post.isPending}
            disabled={amount === null || amount <= 0}
          >
            Post the payment
          </Button>
        </>
      }
    >
      {row && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            This posts a payment against <strong>{name}</strong>&apos;s ledger.
            Check the amount and the reference against the bank line before you
            post — it is a financial record, and correcting it means posting a
            reversal.
          </p>

          <dl className="tnum grid grid-cols-2 gap-1 rounded border border-border bg-surface-sunken px-3 py-2 text-sm">
            <dt className="text-text-muted">Owes now</dt>
            <dd className="text-right">
              {formatMoney(row.amount_owing_minor, currency)}
            </dd>
            <dt className="text-text-muted">Ledger last moved</dt>
            <dd className="text-right text-xs">
              {formatRelative(row.last_entry_at)}
            </dd>
          </dl>

          <Field
            label="Amount received"
            required
            hint="Defaults to what they owe. Change it to match what actually arrived."
          >
            <MoneyInput
              value={amount}
              currency={currency}
              onChange={(minor) => {
                setAmount(minor);
                setError(null);
              }}
            />
          </Field>

          <Field
            label="Reference"
            htmlFor="mark-paid-reference"
            hint={
              row.payment_reference
                ? "Their payment reference. Change it if the bank line says something else."
                : "This person has no payment reference — use whatever the bank line says."
            }
          >
            <Input
              id="mark-paid-reference"
              value={reference}
              maxLength={200}
              placeholder="FNB ref 8823"
              onChange={(event) => setReference(event.target.value)}
            />
          </Field>

          {after && (
            <Note tone={overpaying ? "warning" : "info"}>
              Posts {formatMoney(amount, currency)} as a payment — leaves{" "}
              {name} {after.tone === "settled" ? "settled" : after.text}.
              {overpaying &&
                " That is more than they owe, so they end up in credit."}
            </Note>
          )}

          {error && (
            <p
              role="alert"
              className="rounded border border-danger bg-danger-tint px-2 py-1.5 text-sm text-danger-ink"
            >
              {error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
