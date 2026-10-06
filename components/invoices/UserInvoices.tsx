"use client";

import Link from "next/link";
import { EmptyState, ErrorState, Note, TableSkeleton } from "@/components/ui/Feedback";
import { Panel } from "@/components/ui/Panel";
import { InvoiceStatusBadge } from "@/components/ui/StatusBadge";
import { errorMessage } from "@/lib/api/errors";
import { useInvoices } from "@/lib/api/queries";
import { formatDateTime, formatRelative } from "@/lib/format/datetime";
import { outstandingOn } from "@/lib/format/invoices";
import { formatMoney } from "@/lib/format/money";
import { InvoicePdfButton } from "./InvoicePdfButton";

/**
 * What this person has been billed, and for what.
 *
 * It sits **below** the ledger, not above it, and the order is the point. The
 * balance is the authoritative answer to "what do they owe" — it is the sum of
 * every charge and credit on the account. An invoice is a *document* covering a
 * subset of those charges, so the two legitimately disagree: a bidder can owe
 * money with no invoice yet raised, or hold an unpaid invoice while sitting in
 * credit from an on-account payment nobody allocated.
 *
 * The screen reads top to bottom as deposit (can they bid) → balance (what they
 * owe) → invoices (what we sent them), which is the order the questions
 * actually arrive in.
 */
export function UserInvoices({ userId }: { userId: string }) {
  const { data, isPending, error, refetch } = useInvoices({ userId });
  const rows = data?.items ?? [];
  const hasMore = data?.hasMore ?? false;

  return (
    <Panel
      title="Invoices"
      description="Documents sent to this person. Issued automatically as each sale ends, and never edited afterwards."
      bodyClassName={rows.length ? "p-0" : undefined}
    >
      {error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : isPending ? (
        <TableSkeleton columns={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No invoices"
          description="Nothing has been billed to this person. Invoices are raised when a sale they won in ends."
        />
      ) : (
        <>
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken">
              <tr>
                <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                  Number
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
                <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                  Due
                </th>
                <th className="px-2.5 py-1.5" />
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
                        {formatRelative(row.issued_at)}
                      </span>
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
                      {owing > 0 ? formatMoney(owing, row.currency_code) : "—"}
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
                    <td className="px-2.5 py-1.5 text-right">
                      <InvoicePdfButton invoiceId={row.id} number={row.number} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {hasMore && (
            <div className="border-t border-border px-3 py-2">
              <Note tone="info">
                Showing the most recent. The{" "}
                <Link
                  href={`/invoices`}
                  className="text-accent-strong hover:underline"
                >
                  invoices list
                </Link>{" "}
                has the rest.
              </Note>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
