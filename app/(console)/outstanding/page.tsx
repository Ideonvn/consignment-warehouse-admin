"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { MarkPaidDialog } from "@/components/users/MarkPaidDialog";
import { Button } from "@/components/ui/Button";
import {
  EmptyState,
  ErrorState,
  Note,
  TableSkeleton,
} from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { errorMessage } from "@/lib/api/errors";
import { OUTSTANDING_PAGE_SIZE, useOutstanding } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { formatDateTime, formatRelative } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import type { Outstanding } from "@/types/api";

/**
 * Who owes money, most owing first.
 *
 * A daily working screen: the operator reads down it, phones people, and records
 * what arrives. The server does the ordering, so nothing is re-sorted here — the
 * top of the list is always the biggest debt.
 *
 * `amount_owing_minor` is rendered directly. The balance is also on the row for
 * context, but the owing figure is never derived by negating it here: one
 * forgotten minus sign turns a credit into a debt and someone gets chased for
 * money they do not owe.
 */
export default function OutstandingPage() {
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const { data, isPending, error, refetch, isFetching } = useOutstanding(page);
  const [paying, setPaying] = useState<Outstanding | null>(null);

  const rows = data?.items ?? [];
  const hasMore = data?.hasMore ?? false;
  const currency = rows[0]?.currency_code ?? "ZAR";
  const pageTotal = rows.reduce((sum, row) => sum + row.amount_owing_minor, 0);

  function refresh() {
    void client.invalidateQueries({ queryKey: queryKeys.outstandingRoot });
  }

  return (
    <>
      <PageHeader
        title="Outstanding"
        subtitle="Everyone with money owing, biggest first. Recording a payment takes them off the list."
        actions={
          <Button variant="secondary" onClick={() => void refetch()}>
            Refresh
          </Button>
        }
      />

      {error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : isPending ? (
        <TableSkeleton columns={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={page === 0 ? "Nobody owes anything" : "No more to show"}
          description={
            page === 0
              ? "Every account is settled or in credit. Balances land here as lots close and premiums are raised."
              : "You have reached the end of the list."
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
          <Note tone="info" className="mb-3">
            <strong className="tnum">{formatMoney(pageTotal, currency)}</strong>{" "}
            owed across {rows.length}{" "}
            {rows.length === 1 ? "person" : "people"} on this page.
            {hasMore && " There are more on the next page."}
          </Note>

          <div className="overflow-hidden rounded border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-sunken">
                  <tr>
                    <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                      Bidder
                    </th>
                    <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                      Payment reference
                    </th>
                    <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                      Owing
                    </th>
                    <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                      Last movement
                    </th>
                    <th className="px-2.5 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const name =
                      [row.first_name, row.last_name].filter(Boolean).join(" ") ||
                      row.handle;
                    return (
                      <tr key={row.user_id} className="border-t border-border">
                        <td className="px-2.5 py-1.5">
                          <Link
                            href={`/users/${row.user_id}`}
                            className="font-medium hover:underline"
                          >
                            {name}
                          </Link>
                          <span className="block text-xs text-text-muted">
                            {row.handle}
                          </span>
                        </td>
                        <td className="px-2.5 py-1.5 font-mono text-xs">
                          {row.payment_reference ?? (
                            <span className="font-sans text-text-muted">
                              none
                            </span>
                          )}
                        </td>
                        <td className="tnum px-2.5 py-1.5 text-right font-semibold text-danger-ink">
                          {formatMoney(row.amount_owing_minor, row.currency_code)}
                        </td>
                        <td
                          className="px-2.5 py-1.5 text-xs text-text-muted"
                          title={formatDateTime(row.last_entry_at)}
                        >
                          {formatRelative(row.last_entry_at)}
                        </td>
                        <td className="px-2.5 py-1.5">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => setPaying(row)}
                            >
                              Mark paid
                            </Button>
                            <Link href={`/users/${row.user_id}`}>
                              <Button size="sm" variant="secondary">
                                Ledger
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
              Page {page + 1} · {rows.length} of {OUTSTANDING_PAGE_SIZE}
              {isFetching && " · loading"}
            </span>
          </div>
        </>
      )}

      <MarkPaidDialog
        row={paying}
        onClose={() => setPaying(null)}
        onPosted={() => {
          refresh();
          if (paying) {
            void client.invalidateQueries({
              queryKey: queryKeys.ledgerRoot(paying.user_id),
            });
            void client.invalidateQueries({
              queryKey: queryKeys.user(paying.user_id),
            });
          }
          // Eligibility for any auction follows the balance.
          void client.invalidateQueries({ queryKey: ["auction"] });
        }}
      />
    </>
  );
}
