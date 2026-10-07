"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Note, TableSkeleton } from "@/components/ui/Feedback";
import { Panel } from "@/components/ui/Panel";
import { InvoiceStatusBadge } from "@/components/ui/StatusBadge";
import { issueOutstandingInvoices } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/errors";
import { useInvoiceInvalidation, useInvoices } from "@/lib/api/queries";
import { formatDateTime, formatRelative } from "@/lib/format/datetime";
import { outstandingOn } from "@/lib/format/invoices";
import { formatMoney } from "@/lib/format/money";
import type { AuctionAdmin } from "@/types/api";
import { InvoicePdfButton } from "./InvoicePdfButton";
import { MarkInvoicePaidButton } from "./MarkInvoicePaidButton";

/**
 * What this sale has been billed, and the one manual way to bill the rest.
 *
 * **The worker already does this.** Invoices are raised in the same transaction
 * as the auction going `ended`, so this tab is normally just a record. The
 * button exists for the leftovers — the commonest being a reserve an operator
 * accepted days after the sale, which raises a charge after the sale was
 * invoiced.
 *
 * It is **safe to press repeatedly**, which is why it is a plain button with no
 * confirmation: an invoice covers "every charge for this bidder in this auction
 * that no invoice has billed yet", so a second press with nothing outstanding
 * creates nothing and says so. A unique index on the billed ledger entry makes
 * that true even if two operators press it at the same moment.
 */
export function AuctionInvoices({ auction }: { auction: AuctionAdmin }) {
  const invalidate = useInvoiceInvalidation();
  const { data, isPending, error, refetch } = useInvoices({
    auctionId: auction.id,
  });

  const rows = data?.items ?? [];
  const currency = auction.currency_code;
  const billed = rows.reduce((sum, row) => sum + row.total_minor, 0);
  const owing = rows.reduce((sum, row) => sum + outstandingOn(row), 0);

  const issue = useMutation({
    mutationFn: () => issueOutstandingInvoices(auction.id),
    onSuccess: (issued) => {
      invalidate();
      toast.success(
        issued.length === 0
          ? "Nothing left to bill — every charge in this sale is already on an invoice."
          : `Issued ${issued.length} ${issued.length === 1 ? "invoice" : "invoices"}.`,
      );
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Panel
      title="Invoices"
      description="Raised automatically when the sale ends. Issued documents never change — a correction is made on the ledger behind them."
      actions={
        <Button
          variant="secondary"
          loading={issue.isPending}
          onClick={() => issue.mutate()}
        >
          Bill anything outstanding
        </Button>
      }
      bodyClassName={rows.length ? "p-0" : undefined}
    >
      {error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : isPending ? (
        <TableSkeleton columns={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing billed yet"
          description={
            auction.status === "ended" || auction.status === "settled"
              ? "This sale has ended with no invoices against it, which means no lot closed to a bidder. Press “Bill anything outstanding” if you expected charges."
              : "Invoices are raised as the sale ends and its charges exist."
          }
        />
      ) : (
        <>
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken">
              <tr>
                <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                  Number
                </th>
                <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                  Billed to
                </th>
                <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                  Total
                </th>
                <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                  Still owing
                </th>
                <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                  Status
                </th>
                <th className="px-2.5 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowOwing = outstandingOn(row);
                return (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-2.5 py-1.5">
                      <Link
                        href={`/invoices/${row.id}`}
                        className="font-mono text-xs font-medium hover:underline"
                      >
                        {row.number}
                      </Link>
                      <span
                        className="block text-xs text-text-muted"
                        title={formatDateTime(row.issued_at)}
                      >
                        {formatRelative(row.issued_at)}
                      </span>
                    </td>
                    <td className="px-2.5 py-1.5">
                      <Link
                        href={`/users/${row.user_id}`}
                        className="hover:underline"
                      >
                        {row.bill_to_name ?? "—"}
                      </Link>
                    </td>
                    <td className="tnum px-2.5 py-1.5 text-right">
                      {formatMoney(row.total_minor, row.currency_code)}
                    </td>
                    <td
                      className={
                        rowOwing > 0
                          ? "tnum px-2.5 py-1.5 text-right font-semibold text-danger-ink"
                          : "tnum px-2.5 py-1.5 text-right text-text-muted"
                      }
                    >
                      {rowOwing > 0
                        ? formatMoney(rowOwing, row.currency_code)
                        : "—"}
                    </td>
                    <td className="px-2.5 py-1.5">
                      <InvoiceStatusBadge status={row.status} />
                    </td>
                    <td className="px-2.5 py-1.5">
                      <div className="flex justify-end gap-1.5">
                        <MarkInvoicePaidButton invoice={row} />
                        <InvoicePdfButton
                          invoiceId={row.id}
                          number={row.number}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-border-strong bg-surface-sunken">
              <tr>
                <td
                  colSpan={2}
                  className="px-2.5 py-1.5 text-xs font-semibold text-text-muted"
                >
                  {rows.length} {rows.length === 1 ? "invoice" : "invoices"}
                </td>
                <td className="tnum px-2.5 py-1.5 text-right font-semibold">
                  {formatMoney(billed, currency)}
                </td>
                <td className="tnum px-2.5 py-1.5 text-right font-semibold">
                  {owing > 0 ? formatMoney(owing, currency) : "—"}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>

          <div className="border-t border-border px-3 py-2">
            <Note tone="info">
              More than one invoice per bidder is normal. A document covers the
              charges that were unbilled when it was raised, so a reserve
              accepted after the sale becomes a <em>second</em> invoice rather
              than an edit to the first.
            </Note>
          </div>
        </>
      )}
    </Panel>
  );
}
