"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { createLedgerEntry } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/api/query-keys";
import { formatMoney } from "@/lib/format/money";
import type { InvoiceAdmin } from "@/types/api";

/** What this document still owes. Never negative. */
function outstandingOn(invoice: InvoiceAdmin): number {
  return Math.max(invoice.total_minor - invoice.paid_minor, 0);
}

/**
 * Settle one invoice without leaving the list it is on.
 *
 * **This is not a mark-as-paid route, and there is not one.** It posts an
 * ordinary `payment` through `POST /admin/users/{id}/ledger` with the
 * allocation riding on the same request — the one write path the ledger has,
 * reversible exactly like any other entry. Nothing here edits the document;
 * an invoice becomes paid because a payment was allocated to it, which is the
 * only way it ever becomes paid.
 *
 * **It exists because the trip to the profile was the whole cost.** Most
 * invoices are settled one bank line at a time, and opening a person's account
 * to record each one is four clicks of navigation around one click of work.
 * The same dialog is on all three invoice lists for that reason — including
 * the one *on* the user's account, where making the operator scroll to another
 * tab to settle the row in front of them would be its own silliness.
 *
 * **The amount defaults to what is still outstanding**, floored at the
 * document total. The floor cannot bite today — `paid_minor` is summed from
 * allocations and the server refuses an over-allocation, so outstanding is
 * always within `[0, total]` — and it is written anyway because the default
 * ends up in a `MoneyInput` that posts real money, and a figure that is
 * guaranteed by somebody else's invariant is worth stating where it is used.
 *
 * **Over-allocating is refused by the server, not clamped, and takes the
 * payment down with it.** So the allocation sent is `min(amount, outstanding)`
 * rather than the amount: an operator who types more than this document owes
 * gets the excess as on-account credit, which is ordinary and which the dialog
 * says out loud, instead of losing the entry to a 422.
 */
export function MarkInvoicePaidButton({
  invoice,
  size = "sm",
}: {
  invoice: InvoiceAdmin;
  size?: "sm" | "md";
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  const outstanding = outstandingOn(invoice);
  const currency = invoice.currency_code;

  function start() {
    setAmount(Math.min(outstanding, invoice.total_minor));
    // The DOCUMENT's number, not the person's standing reference: one bank line
    // against one document is what makes the allocation unambiguous, and it is
    // what the PDF tells them to quote.
    setReference(invoice.number);
    setError(null);
    setOpen(true);
  }

  const allocated = Math.min(amount ?? 0, outstanding);
  const onAccount = Math.max((amount ?? 0) - outstanding, 0);

  const post = useMutation({
    mutationFn: () =>
      createLedgerEntry(invoice.user_id, {
        entry_type: "payment",
        amount_minor: amount!,
        reference: reference.trim() || null,
        description: null,
        allocations: [{ invoice_id: invoice.id, amount_minor: allocated }],
      }),
    onSuccess: () => {
      // The whole invoice subtree, because this row's derived status moved and
      // so did any list it appears on. The person's ledger and user record move
      // with it — a payment changes the balance the account screen reads.
      void client.invalidateQueries({ queryKey: queryKeys.invoicesRoot });
      void client.invalidateQueries({
        queryKey: queryKeys.ledgerRoot(invoice.user_id),
      });
      void client.invalidateQueries({ queryKey: queryKeys.user(invoice.user_id) });
      void client.invalidateQueries({ queryKey: queryKeys.outstandingRoot });
      toast.success(
        `Payment of ${formatMoney(amount, currency)} recorded against ${invoice.number}.`,
      );
      setOpen(false);
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

  // Nothing to settle. A paid document needs no button, and an empty dialog
  // would be worse than its absence. **After every hook, not before** — an
  // early return above `useMutation` changes the hook order between a paid row
  // and an unpaid one, which is a lint error here and a real bug in a table
  // where a row's status changes under React.
  if (invoice.status === "paid" || outstanding === 0) return null;

  return (
    <>
      <Button size={size} variant="secondary" onClick={start}>
        Mark paid
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Record a payment for ${invoice.number}`}
        width="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={post.isPending}
            >
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
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            This posts a payment and allocates it to this invoice in the same
            request. Check the amount and the reference against the bank line
            before you post — it is a financial record, and correcting it means
            posting a reversal.
          </p>

          <dl className="tnum grid grid-cols-2 gap-1 rounded border border-border bg-surface-sunken px-3 py-2 text-sm">
            <dt className="text-text-muted">Invoice total</dt>
            <dd className="text-right">
              {formatMoney(invoice.total_minor, currency)}
            </dd>
            {invoice.paid_minor > 0 && (
              <>
                <dt className="text-text-muted">Already paid</dt>
                <dd className="text-right">
                  {formatMoney(invoice.paid_minor, currency)}
                </dd>
              </>
            )}
            <dt className="font-semibold">Still outstanding</dt>
            <dd className="text-right font-semibold">
              {formatMoney(outstanding, currency)}
            </dd>
          </dl>

          <Field
            label="Amount received"
            required
            hint="Defaults to what is still outstanding. Change it to match what actually arrived."
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
            htmlFor="mark-invoice-paid-reference"
            hint="The invoice number, which is what the document tells them to quote. Change it if the bank line says something else."
          >
            <Input
              id="mark-invoice-paid-reference"
              value={reference}
              maxLength={200}
              placeholder={invoice.number}
              onChange={(event) => setReference(event.target.value)}
            />
          </Field>

          {onAccount > 0 && (
            <p className="rounded border border-info-tint-border bg-info-tint px-3 py-2 text-sm">
              {formatMoney(allocated, currency)} settles this invoice and the
              remaining {formatMoney(onAccount, currency)} is recorded as credit
              on their account. That is ordinary — allocating the full amount
              here would be refused and would take the payment with it.
            </p>
          )}

          {error && (
            <p className="rounded border border-danger-tint-border bg-danger-tint px-3 py-2 text-sm text-danger-ink">
              {error}
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}
