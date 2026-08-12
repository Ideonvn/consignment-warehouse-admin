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
import { createLedgerEntry, reverseLedgerEntry } from "@/lib/api/endpoints";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { LEDGER_PAGE_SIZE, useUserLedger } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { formatDateTimeSeconds } from "@/lib/format/datetime";
import {
  describeBalance,
  describeEffect,
  LEDGER_ENTRY_META,
  POSTABLE_ENTRY_TYPES,
} from "@/lib/format/ledger";
import { formatMoney } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import type { LedgerDirection, LedgerEntryAdmin, LedgerEntryType } from "@/types/api";

/**
 * The user's running credit ledger.
 *
 * Append-only: there is deliberately no edit or delete on a row. A mistake is
 * corrected by posting a reversal that points at the original, and both stay on
 * the record — that is what makes the statement reconcilable against a bank.
 */
export function UserLedger({ userId }: { userId: string }) {
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const { data, isPending, error, refetch, isFetching } = useUserLedger(
    userId,
    page,
  );
  const [reversing, setReversing] = useState<LedgerEntryAdmin | null>(null);

  const statement = data?.statement;
  const currency = statement?.currency_code ?? "ZAR";
  const balance = statement?.balance_minor ?? 0;
  const entries = statement?.entries ?? [];
  const summary = describeBalance(balance, currency);

  // A correction names what it undoes, so the entries on this page tell us which
  // of them can still be reversed. Only this page, though — the correction for
  // an older entry may sit on a later one, which is why the 409 stays handled.
  const reversedIds = new Set(
    entries
      .map((entry) => entry.reverses_entry_id)
      .filter((id): id is string => Boolean(id)),
  );

  function invalidate() {
    void client.invalidateQueries({ queryKey: queryKeys.ledgerRoot(userId) });
    void client.invalidateQueries({ queryKey: queryKeys.user(userId) });
    // Eligibility is derived from the balance, so any participants list is stale.
    void client.invalidateQueries({ queryKey: ["auction"] });
  }

  const reverse = useMutation({
    mutationFn: ({ entryId, reason }: { entryId: string; reason: string }) =>
      reverseLedgerEntry(entryId, reason),
    onSuccess: () => {
      invalidate();
      toast.success("Correction posted. Both entries stay on the statement.");
    },
  });

  if (error) {
    return (
      <ErrorState
        title="Could not load the ledger"
        message={errorMessage(error)}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Account balance"
        description="One running ledger. Positive is credit held, negative is money owed."
      >
        {isPending ? (
          <Skeleton className="h-8 w-48" />
        ) : (
          <p
            className={cn(
              "tnum text-2xl font-semibold",
              summary.tone === "owing" && "text-danger-ink",
              summary.tone === "credit" && "text-success-ink",
            )}
          >
            {summary.text}
          </p>
        )}
      </Panel>

      <RecordEntry
        userId={userId}
        currency={currency}
        balanceMinor={balance}
        onPosted={invalidate}
      />

      <Panel
        title="Statement"
        description="Newest first. Nothing here is ever edited or removed — a mistake is corrected with a reversal."
        bodyClassName="p-0"
      >
        {isPending ? (
          <div className="p-3">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : entries.length === 0 ? (
          <div className="p-3">
            <EmptyState
              title="No entries yet"
              description="Record a deposit above and it will appear here."
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
                    Charge
                  </th>
                  <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                    Credit
                  </th>
                  <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                    Balance
                  </th>
                  <th className="w-24 px-2.5 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const meta = LEDGER_ENTRY_META[entry.entry_type];
                  const isCredit = entry.amount_minor >= 0;
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
                        {!isCredit ? formatMoney(magnitude, currency) : ""}
                      </td>
                      <td className="tnum px-2.5 py-1.5 text-right text-success-ink">
                        {isCredit ? formatMoney(magnitude, currency) : ""}
                      </td>
                      <td className="tnum px-2.5 py-1.5 text-right font-medium">
                        {entry.balance_after_minor === null ||
                        entry.balance_after_minor === undefined
                          ? "—"
                          : formatMoney(entry.balance_after_minor, currency)}
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
            {entries.length > 0 && ` · ${entries.length} of ${LEDGER_PAGE_SIZE}`}
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
        reasonHint="Required. Recorded against the correction and visible on the statement."
        description={
          reversing ? (
            <div className="flex flex-col gap-2">
              <p>
                This does not edit or remove the original — nothing on a ledger
                ever is. It posts a matching entry in the opposite direction, and
                both stay on the statement.
              </p>
              <dl className="tnum grid grid-cols-2 gap-1 rounded border border-border bg-surface-sunken px-3 py-2">
                <dt className="text-text-muted">Original</dt>
                <dd className="text-right">
                  {LEDGER_ENTRY_META[reversing.entry_type].label}{" "}
                  {formatMoney(Math.abs(reversing.amount_minor), currency)}
                </dd>
                <dt className="text-text-muted">Balance now</dt>
                <dd className="text-right">
                  {describeBalance(balance, currency).text}
                </dd>
                <dt className="font-semibold">Balance after</dt>
                <dd className="text-right font-semibold">
                  {
                    describeBalance(balance - reversing.amount_minor, currency)
                      .text
                  }
                </dd>
              </dl>
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
                "That entry has already been reversed. Reload the statement to see the existing correction.",
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
 * The daily action: the operator sees money in the bank and records it.
 *
 * There is no +/− control anywhere. The amount is a positive magnitude and the
 * direction comes from the type — the one exception being an adjustment, which
 * has no inherent direction and so must state it.
 */
function RecordEntry({
  userId,
  currency,
  balanceMinor,
  onPosted,
}: {
  userId: string;
  currency: string;
  balanceMinor: number;
  onPosted: () => void;
}) {
  const [type, setType] = useState<LedgerEntryType>("deposit");
  const [amount, setAmount] = useState<number | null>(null);
  const [direction, setDirection] = useState<LedgerDirection | "">("");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const meta = LEDGER_ENTRY_META[type];
  const needsDirection = meta.effect === "either";

  const post = useMutation({
    mutationFn: () =>
      createLedgerEntry(userId, {
        entry_type: type,
        amount_minor: amount!,
        // Sent only for adjustment; the backend refuses it on any other type.
        direction: needsDirection ? (direction as LedgerDirection) : undefined,
        reference: reference.trim() || null,
        description: description.trim() || null,
      }),
    onSuccess: (entry) => {
      onPosted();
      setAmount(null);
      setReference("");
      setDescription("");
      setDirection("");
      setError(null);
      toast.success(
        `${LEDGER_ENTRY_META[entry.entry_type].label} of ${formatMoney(
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
    if (needsDirection && !direction) {
      setError("Say whether this adjustment adds credit or takes it off");
      return;
    }
    setError(null);
    post.mutate();
  }

  const effect = describeEffect(
    type,
    amount,
    balanceMinor,
    currency,
    needsDirection ? (direction as LedgerDirection) : undefined,
  );

  return (
    <Panel
      title="Record money"
      description="Money in or out. The type decides which way it moves."
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Type" htmlFor="entry-type" required hint={meta.hint}>
            <Select
              id="entry-type"
              value={type}
              onChange={(event) => {
                setType(event.target.value as LedgerEntryType);
                setDirection("");
                setError(null);
              }}
            >
              {POSTABLE_ENTRY_TYPES.map((value) => (
                <option key={value} value={value}>
                  {LEDGER_ENTRY_META[value].label}
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

          {needsDirection ? (
            <Field
              label="Direction"
              htmlFor="entry-direction"
              required
              hint="An adjustment is the only type with no direction of its own."
            >
              <Select
                id="entry-direction"
                value={direction}
                onChange={(event) => {
                  setDirection(event.target.value as LedgerDirection | "");
                  setError(null);
                }}
              >
                <option value="">Choose…</option>
                <option value="credit">Add credit</option>
                <option value="debit">Take credit off</option>
              </Select>
            </Field>
          ) : (
            <Field label="Direction" hint="Set by the type you chose.">
              <Input
                value={meta.effect === "credit" ? "Adds credit" : "Takes credit off"}
                disabled
              />
            </Field>
          )}

          <Field
            label="Reference"
            htmlFor="entry-reference"
            hint="Bank reference or invoice number — what reconciles this."
          >
            <Input
              id="entry-reference"
              value={reference}
              maxLength={200}
              placeholder="FNB ref 8823"
              onChange={(event) => setReference(event.target.value)}
            />
          </Field>
        </div>

        <Field label="Description" htmlFor="entry-description">
          <Input
            id="entry-description"
            value={description}
            maxLength={2000}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        {effect && <Note tone="info">{effect}</Note>}

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
