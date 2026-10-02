"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState, ErrorState, Note, Skeleton } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Field";
import { Input, Select } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Panel } from "@/components/ui/Panel";
import { createDepositEntry, reverseDepositEntry } from "@/lib/api/endpoints";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { DEPOSIT_PAGE_SIZE, useUserDeposit } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { formatDateTimeSeconds } from "@/lib/format/datetime";
import {
  DEPOSIT_ENTRY_META,
  POSTABLE_DEPOSIT_TYPES,
  describeDepositEffect,
  describeHeld,
} from "@/lib/format/deposits";
import { formatMoney } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import type { DepositEntryAdmin, DepositEntryType } from "@/types/api";

/**
 * The security-deposit book — what we hold, and what lets this person bid.
 *
 * **This is not the account balance.** Winning a lot charges the trading ledger
 * and cannot touch this number; a refund here can stop someone bidding even
 * though they are in credit. The two panels are deliberately separate on screen
 * for the same reason the backend keeps two tables: one control that could do
 * both is how a deposit gets spent on an invoice.
 *
 * Append-only, like the ledger: no edit, no delete, and a mistake is corrected
 * by a reversal that points at the original. Both stay on the record.
 */
export function UserDeposit({
  userId,
  paymentReference,
}: {
  userId: string;
  /** Defaulted into the reference field so it is not typed off a bank statement. */
  paymentReference?: string | null;
}) {
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const { data, isPending, error, refetch, isFetching } = useUserDeposit(
    userId,
    page,
  );
  const [reversing, setReversing] = useState<DepositEntryAdmin | null>(null);

  const statement = data?.statement;
  const currency = statement?.currency_code ?? "ZAR";
  const held = statement?.held_minor ?? 0;
  const entries = statement?.entries ?? [];
  const summary = describeHeld(held, currency);

  // A correction names what it undoes, so the entries on this page tell us which
  // of them can still be reversed. Only this page, though — the correction for an
  // older entry may sit on a later one, which is why the 409 stays handled.
  const reversedIds = new Set(
    entries
      .map((entry) => entry.reverses_entry_id)
      .filter((id): id is string => Boolean(id)),
  );

  function invalidate() {
    void client.invalidateQueries({ queryKey: queryKeys.depositRoot(userId) });
    // Eligibility for anyone who has not bid in an auction yet follows the held
    // deposit, so any participants list is stale.
    void client.invalidateQueries({ queryKey: ["auction"] });
  }

  const reverse = useMutation({
    mutationFn: ({ entryId, reason }: { entryId: string; reason: string }) =>
      reverseDepositEntry(entryId, reason),
    onSuccess: () => {
      invalidate();
      toast.success("Correction posted. Both entries stay on the record.");
    },
  });

  if (error) {
    return (
      <ErrorState
        title="Could not load the deposit book"
        message={errorMessage(error)}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Deposit held"
        description="What this person has lodged as a security deposit. This is the number that decides whether they can bid — winning a lot never reduces it."
      >
        {isPending ? (
          <Skeleton className="h-8 w-48" />
        ) : (
          <p
            className={cn(
              "tnum text-2xl font-semibold",
              summary.tone === "none" && "text-text-muted",
            )}
          >
            {summary.text}
          </p>
        )}
      </Panel>

      <RecordDeposit
        userId={userId}
        currency={currency}
        heldMinor={held}
        paymentReference={paymentReference}
        onPosted={invalidate}
      />

      <Panel
        title="Deposit movements"
        description="Newest first. Nothing here is ever edited or removed — a mistake is corrected with a reversal."
        bodyClassName="p-0"
      >
        {isPending ? (
          <div className="p-3">
            <Skeleton className="h-28 w-full" />
          </div>
        ) : entries.length === 0 ? (
          <div className="p-3">
            <EmptyState
              title="No deposit on record"
              description="Until a deposit is recorded here, this person cannot bid in any auction that asks for one — whatever their account balance says."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken">
                <tr>
                  <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                    Date
                  </th>
                  <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                    Type
                  </th>
                  <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                    Reference
                  </th>
                  <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                    Out
                  </th>
                  <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                    In
                  </th>
                  <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                    Held
                  </th>
                  <th className="w-24 px-2.5 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const meta = DEPOSIT_ENTRY_META[entry.entry_type];
                  const isIn = entry.amount_minor >= 0;
                  const magnitude = Math.abs(entry.amount_minor);
                  const isCorrection = entry.entry_type === "reversal";
                  const alreadyReversed = reversedIds.has(entry.id);
                  return (
                    <tr
                      key={entry.id}
                      className={cn(
                        "border-t border-border",
                        isCorrection && "bg-surface-sunken",
                      )}
                    >
                      <td className="tnum px-2.5 py-1.5 text-xs whitespace-nowrap text-text-muted">
                        {formatDateTimeSeconds(entry.created_at)}
                      </td>
                      <td className="px-2.5 py-1.5">
                        <span className="font-medium">{meta.label}</span>
                        {entry.description && (
                          <span className="block text-xs text-text-muted">
                            {entry.description}
                          </span>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 font-mono text-xs">
                        {entry.reference ?? (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="tnum px-2.5 py-1.5 text-right text-danger-ink">
                        {!isIn ? formatMoney(magnitude, currency) : ""}
                      </td>
                      <td className="tnum px-2.5 py-1.5 text-right text-success-ink">
                        {isIn ? formatMoney(magnitude, currency) : ""}
                      </td>
                      <td className="tnum px-2.5 py-1.5 text-right font-medium">
                        {entry.held_after_minor === null ||
                        entry.held_after_minor === undefined
                          ? "—"
                          : formatMoney(entry.held_after_minor, currency)}
                      </td>
                      <td className="px-2.5 py-1.5 text-right">
                        {isCorrection ? null : alreadyReversed ? (
                          <span className="text-xs text-text-muted">
                            Reversed
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setReversing(entry)}
                          >
                            Reverse
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border px-3 py-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(p - 1, 0))}
          >
            Newer
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!data?.hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            Older
          </Button>
          <span className="tnum text-xs text-text-muted">
            Page {page + 1}
            {isFetching && " · loading"}
            {entries.length > 0 &&
              ` · ${entries.length} of ${DEPOSIT_PAGE_SIZE}`}
          </span>
        </div>
      </Panel>

      <ConfirmDialog
        open={reversing !== null}
        onClose={() => setReversing(null)}
        title="Reverse this entry"
        tone="warning"
        confirmLabel="Post the correction"
        requireReason
        reasonHint="Required. Recorded against the correction and visible on the record."
        description={
          reversing ? (
            <div className="flex flex-col gap-2">
              <p>
                This does not edit or remove the original. It posts a matching
                entry in the opposite direction, and both stay on the record.
              </p>
              <dl className="tnum grid grid-cols-2 gap-1 rounded border border-border bg-surface-sunken px-3 py-2">
                <dt className="text-text-muted">Original</dt>
                <dd className="text-right">
                  {DEPOSIT_ENTRY_META[reversing.entry_type].label}{" "}
                  {formatMoney(Math.abs(reversing.amount_minor), currency)}
                </dd>
                <dt className="text-text-muted">Held now</dt>
                <dd className="text-right">{formatMoney(held, currency)}</dd>
                <dt className="font-semibold">Held after</dt>
                <dd className="text-right font-semibold">
                  {formatMoney(held - reversing.amount_minor, currency)}
                </dd>
              </dl>
              {held - reversing.amount_minor < held && (
                <Note tone="warning">
                  This lowers what we hold, so it can make them ineligible for
                  auctions they have not bid in yet. Sales they have already bid
                  in are unaffected — admission is earned once.
                </Note>
              )}
              <p>An entry can only be reversed once.</p>
            </div>
          ) : null
        }
        onConfirm={async ({ reason }) => {
          try {
            await reverse.mutateAsync({ entryId: reversing!.id, reason });
          } catch (err) {
            if (isApiError(err) && err.status === 409) {
              // The 409 here means exactly one thing, so say that thing.
              throw new Error(
                "That entry has already been reversed. Reload the page to see the existing correction.",
              );
            }
            throw err;
          }
        }}
      />
    </div>
  );
}

/**
 * The daily action: a deposit lands in the bank and the operator records it.
 *
 * There is no +/− control. The amount is a positive magnitude and the direction
 * comes from the type — and unlike the ledger there is no ambiguous type here, so
 * there is no direction field at all.
 */
function RecordDeposit({
  userId,
  currency,
  heldMinor,
  paymentReference,
  onPosted,
}: {
  userId: string;
  currency: string;
  heldMinor: number;
  paymentReference?: string | null;
  onPosted: () => void;
}) {
  const [type, setType] = useState<DepositEntryType>("paid");
  const [amount, setAmount] = useState<number | null>(null);
  const [reference, setReference] = useState(paymentReference ?? "");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  // The reference arrives with the user record, which loads after this mounts.
  // Reconciled during render rather than in an effect, and only while the field
  // is untouched, so it never overwrites something the operator has typed.
  const [lastDefault, setLastDefault] = useState(paymentReference ?? "");
  if ((paymentReference ?? "") !== lastDefault) {
    if (reference === lastDefault) setReference(paymentReference ?? "");
    setLastDefault(paymentReference ?? "");
  }

  const meta = DEPOSIT_ENTRY_META[type];

  const post = useMutation({
    mutationFn: () =>
      createDepositEntry(userId, {
        // `reversal` is not in POSTABLE_DEPOSIT_TYPES, so this cast only ever
        // narrows to the two the backend accepts here.
        entry_type: type as "paid" | "refunded",
        amount_minor: amount!,
        reference: reference.trim() || null,
        description: description.trim() || null,
      }),
    onSuccess: (entry) => {
      onPosted();
      setAmount(null);
      // Back to their reference, not blank: the next entry is usually theirs too.
      setReference(paymentReference ?? "");
      setDescription("");
      setError(null);
      toast.success(
        `${DEPOSIT_ENTRY_META[entry.entry_type].label} of ${formatMoney(
          Math.abs(entry.amount_minor),
          currency,
        )} recorded.`,
      );
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (amount === null || amount <= 0) {
      setError("Enter an amount greater than zero");
      return;
    }
    setError(null);
    post.mutate();
  }

  const effect = describeDepositEffect(type, amount, heldMinor, currency);
  const overRefunding = type === "refunded" && (amount ?? 0) > heldMinor;

  return (
    <Panel
      title="Record a deposit"
      description="Money lodged as a security deposit, or paid back out. Recording one is all it takes to let someone bid — there is nothing to approve."
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Type" htmlFor="deposit-type" required hint={meta.hint}>
            <Select
              id="deposit-type"
              value={type}
              onChange={(event) => {
                setType(event.target.value as DepositEntryType);
                setError(null);
              }}
            >
              {POSTABLE_DEPOSIT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {DEPOSIT_ENTRY_META[value].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Amount" required>
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
            htmlFor="deposit-reference"
            hint="Bank reference — what reconciles this against the statement."
          >
            <Input
              id="deposit-reference"
              value={reference}
              maxLength={200}
              placeholder="FNB ref 8823"
              onChange={(event) => setReference(event.target.value)}
            />
          </Field>
        </div>

        <Field label="Description" htmlFor="deposit-description">
          <Input
            id="deposit-description"
            value={description}
            maxLength={2000}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        {effect && (
          <Note tone={overRefunding ? "warning" : "info"}>
            {effect}
            {overRefunding &&
              " That is more than we hold, which would leave the deposit negative — check the amount."}
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

        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" loading={post.isPending}>
            Record {meta.label.toLowerCase()}
          </Button>
          <span className="text-xs text-text-muted">
            Posted immediately and cannot be edited afterwards — a mistake is
            fixed with a reversal.
          </span>
        </div>
      </form>
    </Panel>
  );
}
