"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { RelistDialog } from "@/components/lots/LotActions";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  EmptyState,
  ErrorState,
  Note,
  TableSkeleton,
} from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { acceptReserve } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/errors";
import {
  DECISIONS_PAGE_SIZE,
  useAuctions,
  useDecisions,
} from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { formatDateTime } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import type { LotAdminSummary } from "@/types/api";

export default function DecisionsPage() {
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const { data, isPending, error, refetch, isFetching } = useDecisions(page);
  const [accepting, setAccepting] = useState<LotAdminSummary | null>(null);
  const [relisting, setRelisting] = useState<LotAdminSummary | null>(null);

  // Server order is by closing time then lot number — deliberately not re-sorted.
  const rows = data ?? [];
  const hasMore = rows.length === DECISIONS_PAGE_SIZE;

  // One extra call for the auction names and currencies these lots belong to.
  // Cached across the app, so it is usually already in hand.
  const { data: auctions } = useAuctions({ limit: 200 });
  const auctionsById = new Map((auctions ?? []).map((a) => [a.id, a]));
  const currencyFor = (lot: LotAdminSummary) =>
    auctionsById.get(lot.auction_id)?.currency_code ?? "ZAR";

  const accept = useMutation({
    mutationFn: ({ lotId, reason }: { lotId: string; reason: string }) =>
      acceptReserve(lotId, reason),
    onSuccess: (lot) => {
      void client.invalidateQueries({ queryKey: queryKeys.decisionsRoot });
      void client.invalidateQueries({ queryKey: queryKeys.lot(lot.id) });
      void client.invalidateQueries({ queryKey: queryKeys.lots(lot.auction_id) });
      toast.success(`"${lot.title}" is sold to the top bidder.`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <PageHeader
        title="Decisions"
        subtitle="Lots that closed below their reserve. Nothing happens to them until you decide."
        actions={
          <Button variant="secondary" onClick={() => void refetch()}>
            Refresh
          </Button>
        }
      />

      {error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : isPending ? (
        <TableSkeleton columns={7} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={page === 0 ? "Nothing waiting on you" : "No more to review"}
          description={
            page === 0
              ? "Lots that end below their reserve land here. Check back after an auction closes."
              : "You have reached the end of the queue."
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
          <Note tone="warning" className="mb-3">
            Each of these has a real top bid that did not reach the reserve.
            Accepting sells below reserve; relisting puts the item back in
            another auction with a clean slate.
          </Note>

          <div className="overflow-hidden rounded border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken">
                <tr>
                  <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                    Lot
                  </th>
                  <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                    Auction
                  </th>
                  <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                    Reserve
                  </th>
                  <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                    Top bid
                  </th>
                  <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                    Shortfall
                  </th>
                  <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                    Top bidder
                  </th>
                  <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                    Closed
                  </th>
                  <th className="px-2.5 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((lot) => {
                  const currency = currencyFor(lot);
                  const auction = auctionsById.get(lot.auction_id);
                  const shortfall = Math.max(
                    (lot.reserve_price_minor ?? 0) - (lot.current_bid_minor ?? 0),
                    0,
                  );
                  return (
                    <tr key={lot.id} className="border-t border-border">
                      <td className="px-2.5 py-1.5">
                        <Link
                          href={`/lots/${lot.id}`}
                          className="font-medium hover:underline"
                        >
                          #{lot.lot_number ?? "—"} {lot.title}
                        </Link>
                      </td>
                      <td className="px-2.5 py-1.5">
                        <Link
                          href={`/auctions/${lot.auction_id}?tab=lots`}
                          className="text-xs text-text-muted hover:underline"
                        >
                          {auction?.name ?? "Open auction"}
                        </Link>
                      </td>
                      <td className="tnum px-2.5 py-1.5 text-right">
                        {formatMoney(lot.reserve_price_minor, currency)}
                      </td>
                      <td className="tnum px-2.5 py-1.5 text-right">
                        {formatMoney(lot.current_bid_minor, currency)}
                      </td>
                      <td className="tnum px-2.5 py-1.5 text-right font-semibold text-warning-ink">
                        {formatMoney(shortfall, currency)}
                      </td>
                      <td className="px-2.5 py-1.5">
                        {lot.current_leader_handle ?? (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="tnum px-2.5 py-1.5 text-xs text-text-muted">
                        {formatDateTime(lot.effective_ends_at)}
                      </td>
                      <td className="px-2.5 py-1.5">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => setAccepting(lot)}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setRelisting(lot)}
                          >
                            Relist
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
              Page {page + 1}
              {isFetching && " · loading"}
            </span>
          </div>
        </>
      )}

      <ConfirmDialog
        open={accepting !== null}
        onClose={() => setAccepting(null)}
        title="Sell below the reserve"
        tone="warning"
        confirmLabel="Accept the top bid"
        requireReason
        reasonHint="Required. Recorded against the decision to sell under reserve."
        description={
          accepting ? (
            <div className="flex flex-col gap-2">
              <p>
                <strong>{accepting.title}</strong> closed below its reserve.
                Accepting promotes the top bid to won and marks the lot sold.
              </p>
              <dl className="tnum grid grid-cols-2 gap-1 rounded border border-border bg-surface-sunken px-3 py-2">
                <dt className="text-text-muted">Reserve</dt>
                <dd className="text-right">
                  {formatMoney(
                    accepting.reserve_price_minor,
                    currencyFor(accepting),
                  )}
                </dd>
                <dt className="text-text-muted">Top bid</dt>
                <dd className="text-right">
                  {formatMoney(
                    accepting.current_bid_minor,
                    currencyFor(accepting),
                  )}
                </dd>
                <dt className="font-semibold text-warning-ink">You give up</dt>
                <dd className="text-right font-semibold text-warning-ink">
                  {formatMoney(
                    Math.max(
                      (accepting.reserve_price_minor ?? 0) -
                        (accepting.current_bid_minor ?? 0),
                      0,
                    ),
                    currencyFor(accepting),
                  )}
                </dd>
              </dl>
              <p>
                {accepting.current_leader_handle ?? "The top bidder"} wins the
                lot at their bid. This cannot be undone.
              </p>
            </div>
          ) : null
        }
        onConfirm={({ reason }) =>
          accepting
            ? accept.mutateAsync({ lotId: accepting.id, reason })
            : undefined
        }
      />

      <RelistDialog
        open={relisting !== null}
        onClose={() => setRelisting(null)}
        lot={
          relisting
            ? { id: relisting.id, auction_id: relisting.auction_id }
            : { id: "", auction_id: "" }
        }
      />
    </>
  );
}
