"use client";

import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
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
import { acceptReserve, listLotBids } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/errors";
import { useDecisions, type DecisionLot } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { formatDateTime } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";

export default function DecisionsPage() {
  const client = useQueryClient();
  const { data, isPending, error, refetch } = useDecisions();
  const [accepting, setAccepting] = useState<DecisionLot | null>(null);
  const [relisting, setRelisting] = useState<DecisionLot | null>(null);

  const rows = data ?? [];

  // The lot summary carries the leader's user id but not their handle, so the
  // top bid is fetched per row. The queue is short, so this stays cheap.
  const leaders = useQueries({
    queries: rows.map(({ lot }) => ({
      queryKey: [...queryKeys.lotBids(lot.id), "top"],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        listLotBids(lot.id, { limit: 1 }, signal),
      staleTime: 60_000,
    })),
    combine: (results) => {
      const map = new Map<string, string | null>();
      rows.forEach(({ lot }, index) => {
        map.set(lot.id, results[index]?.data?.items[0]?.bidder_handle ?? null);
      });
      return map;
    },
  });

  const accept = useMutation({
    mutationFn: ({ lotId, reason }: { lotId: string; reason: string }) =>
      acceptReserve(lotId, reason),
    onSuccess: (lot) => {
      void client.invalidateQueries({ queryKey: queryKeys.decisions });
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
          title="Nothing waiting on you"
          description="Lots that end below their reserve land here. Check back after an auction closes."
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
                {rows.map((row) => {
                  const { lot, auction } = row;
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
                          href={`/auctions/${auction.id}?tab=lots`}
                          className="text-xs text-text-muted hover:underline"
                        >
                          {auction.name}
                        </Link>
                      </td>
                      <td className="tnum px-2.5 py-1.5 text-right">
                        {formatMoney(lot.reserve_price_minor, auction.currency_code)}
                      </td>
                      <td className="tnum px-2.5 py-1.5 text-right">
                        {formatMoney(lot.current_bid_minor, auction.currency_code)}
                      </td>
                      <td className="tnum px-2.5 py-1.5 text-right font-semibold text-warning-ink">
                        {formatMoney(shortfall, auction.currency_code)}
                      </td>
                      <td className="px-2.5 py-1.5">
                        {leaders.get(lot.id) ?? (
                          <span className="text-text-muted">·</span>
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
                            onClick={() => setAccepting(row)}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setRelisting(row)}
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
                <strong>{accepting.lot.title}</strong> closed below its reserve.
                Accepting promotes the top bid to won and marks the lot sold.
              </p>
              <dl className="tnum grid grid-cols-2 gap-1 rounded border border-border bg-surface-sunken px-3 py-2">
                <dt className="text-text-muted">Reserve</dt>
                <dd className="text-right">
                  {formatMoney(
                    accepting.lot.reserve_price_minor,
                    accepting.auction.currency_code,
                  )}
                </dd>
                <dt className="text-text-muted">Top bid</dt>
                <dd className="text-right">
                  {formatMoney(
                    accepting.lot.current_bid_minor,
                    accepting.auction.currency_code,
                  )}
                </dd>
                <dt className="font-semibold text-warning-ink">
                  You give up
                </dt>
                <dd className="text-right font-semibold text-warning-ink">
                  {formatMoney(
                    Math.max(
                      (accepting.lot.reserve_price_minor ?? 0) -
                        (accepting.lot.current_bid_minor ?? 0),
                      0,
                    ),
                    accepting.auction.currency_code,
                  )}
                </dd>
              </dl>
              <p>
                {leaders.get(accepting.lot.id) ?? "The top bidder"} wins the lot
                at their bid. This cannot be undone.
              </p>
            </div>
          ) : null
        }
        onConfirm={({ reason }) =>
          accepting
            ? accept.mutateAsync({ lotId: accepting.lot.id, reason })
            : undefined
        }
      />

      <RelistDialog
        open={relisting !== null}
        onClose={() => setRelisting(null)}
        lot={
          relisting
            ? {
                id: relisting.lot.id,
                auction_id: relisting.lot.auction_id,
              }
            : { id: "", auction_id: "" }
        }
      />
    </>
  );
}
