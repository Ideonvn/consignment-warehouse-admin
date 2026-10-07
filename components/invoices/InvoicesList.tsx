"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  EmptyState,
  ErrorState,
  Note,
  TableSkeleton,
} from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { InvoiceStatusBadge } from "@/components/ui/StatusBadge";
import { errorMessage } from "@/lib/api/errors";
import { INVOICES_PAGE_SIZE, useInvoices } from "@/lib/api/queries";
import { formatDateTime, formatRelative } from "@/lib/format/datetime";
import { outstandingOn } from "@/lib/format/invoices";
import { formatMoney } from "@/lib/format/money";
import { InvoicePdfButton } from "./InvoicePdfButton";
import { MarkInvoicePaidButton } from "./MarkInvoicePaidButton";

/**
 * Every issued invoice, newest first.
 *
 * **There is nothing to create here and nothing to edit.** Invoices are raised
 * by the worker as each sale ends; the only manual issue is "bill what is left
 * in this sale", and it lives on the auction it belongs to rather than on a
 * cross-auction list. An invoice is immutable once issued — a mistake is
 * corrected by reversing the charge, and the next invoice bills what is
 * actually owed — so no row offers an edit or a delete.
 *
 * `status` and `paid_minor` come from the server on every read and are rendered
 * as given. Deriving either here would eventually disagree with the `unpaid`
 * filter, which is applied to the server's own derivation.
 */
export function InvoicesList() {
  const [unpaid, setUnpaid] = useState(false);
  const [page, setPage] = useState(0);
  const { data, isPending, error, refetch, isFetching } = useInvoices(
    { unpaid },
    page,
  );

  const rows = data?.items ?? [];
  const hasMore = data?.hasMore ?? false;
  const currency = rows[0]?.currency_code ?? "ZAR";
  const pageOwing = rows.reduce((sum, row) => sum + outstandingOn(row), 0);

  function setFilter(next: boolean) {
    setUnpaid(next);
    setPage(0);
  }

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Issued automatically as each sale ends. A document never changes once issued — corrections are made on the ledger behind it."
        actions={
          <Button variant="secondary" onClick={() => void refetch()}>
            Refresh
          </Button>
        }
      />

      <div className="mb-3 flex items-center gap-1.5">
        <Button
          size="sm"
          variant={unpaid ? "secondary" : "primary"}
          onClick={() => setFilter(false)}
        >
          All
        </Button>
        <Button
          size="sm"
          variant={unpaid ? "primary" : "secondary"}
          onClick={() => setFilter(true)}
        >
          Still owing
        </Button>
      </div>

      {error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : isPending ? (
        <TableSkeleton columns={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            page > 0
              ? "No more to show"
              : unpaid
                ? "Everything is settled"
                : "No invoices yet"
          }
          description={
            page > 0
              ? "You have reached the end of the list."
              : unpaid
                ? "Every issued invoice has been paid in full."
                : "Invoices are raised when a sale ends and its charges exist. Nothing has closed yet."
          }
          action={
            page > 0 ? (
              <Button variant="secondary" onClick={() => setPage(0)}>
                Back to the first page
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {pageOwing > 0 && (
            <Note tone="info" className="mb-3">
              <strong className="tnum">
                {formatMoney(pageOwing, currency)}
              </strong>{" "}
              still owing across this page.
              {unpaid && hasMore && " There are more on the next page."}
            </Note>
          )}

          <div className="overflow-hidden rounded border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-sunken">
                  <tr>
                    <Th>Number</Th>
                    <Th>Billed to</Th>
                    <Th align="right">Total</Th>
                    <Th align="right">Still owing</Th>
                    <Th>Status</Th>
                    <Th>Due</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const owing = outstandingOn(row);
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
                            issued {formatRelative(row.issued_at)}
                          </span>
                        </td>
                        <td className="px-2.5 py-1.5">
                          <Link
                            href={`/users/${row.user_id}`}
                            className="hover:underline"
                          >
                            {row.bill_to_name ?? "—"}
                          </Link>
                          {row.bill_to_reference && (
                            <span className="block font-mono text-xs text-text-muted">
                              {row.bill_to_reference}
                            </span>
                          )}
                        </td>
                        <td className="tnum px-2.5 py-1.5 text-right">
                          {formatMoney(row.total_minor, row.currency_code)}
                        </td>
                        <td
                          className={
                            owing > 0
                              ? "tnum px-2.5 py-1.5 text-right font-semibold text-danger-ink"
                              : "tnum px-2.5 py-1.5 text-right text-text-muted"
                          }
                        >
                          {owing > 0
                            ? formatMoney(owing, row.currency_code)
                            : "—"}
                        </td>
                        <td className="px-2.5 py-1.5">
                          <InvoiceStatusBadge status={row.status} />
                        </td>
                        <td
                          className="px-2.5 py-1.5 text-xs text-text-muted"
                          title={formatDateTime(row.due_at)}
                        >
                          {formatRelative(row.due_at)}
                        </td>
                        <td className="px-2.5 py-1.5">
                          <div className="flex justify-end gap-1.5">
                            {/* Renders nothing on a settled document. */}
                            <MarkInvoicePaidButton invoice={row} />
                            <InvoicePdfButton
                              invoiceId={row.id}
                              number={row.number}
                            />
                            <Link href={`/invoices/${row.id}`}>
                              <Button size="sm" variant="secondary">
                                Open
                              </Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
            <span className="tnum text-xs text-text-muted">
              Page {page + 1} · {rows.length} of {INVOICES_PAGE_SIZE}
              {isFetching && " · loading"}
            </span>
          </div>

          {unpaid && (
            // Worth saying once: the server sums the allocations and then drops
            // the settled rows, so a short page is not the end of the list.
            <p className="mt-1.5 text-xs text-text-muted">
              Filtered after the page was read, so a page can be short while
              there are more behind it. Use Next until it stops.
            </p>
          )}
        </>
      )}
    </>
  );
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-2.5 py-1.5 text-xs font-semibold text-text-muted ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
