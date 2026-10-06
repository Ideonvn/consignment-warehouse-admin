"use client";

import { Button } from "@/components/ui/Button";
import { Note, Skeleton } from "@/components/ui/Feedback";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { useUnpaidInvoicesFor } from "@/lib/api/queries";
import { outstandingOn } from "@/lib/format/invoices";
import { formatMoney } from "@/lib/format/money";

/** invoice id → how much of this payment goes to it, in minor units. */
export type AllocationDraft = Record<string, number>;

export function allocatedTotal(draft: AllocationDraft): number {
  return Object.values(draft).reduce((sum, minor) => sum + (minor || 0), 0);
}

/** The wire shape, with the untouched rows dropped. */
export function toAllocationList(
  draft: AllocationDraft,
): { invoice_id: string; amount_minor: number }[] {
  return Object.entries(draft)
    .filter(([, minor]) => minor > 0)
    .map(([invoice_id, amount_minor]) => ({ invoice_id, amount_minor }));
}

/**
 * Apply a payment to this person's open invoices.
 *
 * **This is the only way an invoice becomes paid.** There is no mark-as-paid
 * route and there should not be one — settling is an ordinary `payment` entry,
 * which keeps the ledger to a single write path — so the allocation rides along
 * with that entry and is written in the same transaction. A payment that
 * committed while its allocation did not would read as on-account credit
 * against an invoice still showing unpaid, and nothing on screen would
 * distinguish that from an allocation the operator forgot.
 *
 * **Leaving everything at zero is a legitimate answer.** A payment with no
 * allocations is on-account credit, which is ordinary rather than an incomplete
 * request — so nothing here is required and the control simply disappears when
 * the person has no open invoices.
 *
 * ⚠️ **There is no un-allocate.** An allocation is not money: the ledger entry
 * it points at is immutable, and an allocation whose entry has been reversed
 * stops counting on its own. So a mistake here is fixed by reversing the
 * payment and posting it again, which the ledger already allows exactly once.
 * Over-allocating is refused by the server rather than clamped — in both
 * directions — and takes the payment down with it, which is why this checks
 * before submitting rather than letting the operator discover it.
 */
export function AllocateToInvoices({
  userId,
  currency,
  paymentMinor,
  value,
  onChange,
}: {
  userId: string;
  currency: string;
  /** The payment being posted. Allocations may not exceed it. */
  paymentMinor: number;
  value: AllocationDraft;
  onChange: (next: AllocationDraft) => void;
}) {
  const { data, isPending } = useUnpaidInvoicesFor(userId);
  const invoices = data?.items ?? [];

  if (isPending) return <Skeleton className="h-16 w-full" />;
  // Nothing open: the control is absent rather than present and empty, so the
  // form for a bidder with no invoices looks exactly as it did before.
  if (invoices.length === 0) return null;

  const allocated = allocatedTotal(value);
  const unallocated = paymentMinor - allocated;

  function set(invoiceId: string, minor: number | null) {
    onChange({ ...value, [invoiceId]: minor ?? 0 });
  }

  return (
    <div className="rounded border border-border bg-surface-sunken px-3 py-2.5">
      <p className="text-sm font-semibold">Apply this payment to invoices</p>
      <p className="mt-0.5 text-xs text-text-muted">
        Optional. Anything left over stays as credit on the account — that is a
        normal outcome, not an unfinished job.
      </p>

      <table className="mt-2 w-full text-sm">
        <tbody>
          {invoices.map((invoice) => {
            const owing = outstandingOn(invoice);
            const mine = value[invoice.id] ?? 0;
            // What this row could still take: never more than it owes, and
            // never more than the payment has left after the other rows.
            const headroom = Math.min(owing, unallocated + mine);
            return (
              <tr key={invoice.id} className="border-t border-border">
                <td className="py-1.5 pr-2">
                  <span className="font-mono text-xs font-medium">
                    {invoice.number}
                  </span>
                  <span className="block text-xs text-text-muted">
                    {formatMoney(owing, invoice.currency_code)} owing
                  </span>
                </td>
                <td className="w-40 py-1.5 pr-2">
                  <MoneyInput
                    value={mine || null}
                    currency={currency}
                    onChange={(minor) => set(invoice.id, minor)}
                  />
                </td>
                <td className="w-24 py-1.5 text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={headroom <= 0}
                    // Disabled until there is a payment to settle FROM, which
                    // is not self-evident from a greyed button — "settle this
                    // invoice" reads like it should work on its own.
                    title={
                      paymentMinor <= 0
                        ? "Enter the amount received first — this applies as much of it as the invoice needs"
                        : headroom <= 0
                          ? "The payment is fully allocated to the other invoices"
                          : `Apply ${formatMoney(headroom, currency)} of this payment here`
                    }
                    onClick={() => set(invoice.id, headroom)}
                  >
                    Settle
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Note tone={unallocated < 0 ? "warning" : "info"} className="mt-2">
        {unallocated < 0 ? (
          <>
            That allocates{" "}
            <strong className="tnum">
              {formatMoney(-unallocated, currency)}
            </strong>{" "}
            more than the payment is worth. The server refuses this rather than
            trimming it, and the payment would not land either.
          </>
        ) : unallocated === 0 && allocated > 0 ? (
          <>
            All of it allocated. Nothing stays on account.
          </>
        ) : (
          <>
            <strong className="tnum">
              {formatMoney(unallocated, currency)}
            </strong>{" "}
            of this payment stays as credit on the account.
          </>
        )}
      </Note>
    </div>
  );
}
