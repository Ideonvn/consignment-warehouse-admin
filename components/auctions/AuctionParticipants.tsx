"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Note, TableSkeleton } from "@/components/ui/Feedback";
import { Input } from "@/components/ui/Input";
import { errorMessage } from "@/lib/api/errors";
import { useParticipants } from "@/lib/api/queries";
import { describeBalance } from "@/lib/format/ledger";
import { formatMoney } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import type { AuctionAdmin, Participant } from "@/types/api";

type Filter = "ineligible" | "all";
type SortKey = "shortfall" | "name" | "balance";

/**
 * Who can bid and who cannot.
 *
 * Computed on read by the backend — there is no registration or approval step,
 * so there is deliberately no "approve" control here. Eligibility follows from
 * the balance, which means recording a deposit is what makes someone eligible;
 * every row links straight to that person's ledger so it is one hop away.
 *
 * Defaults to the ineligible list, because that is the working list: the people
 * to chase before the auction opens.
 */
export function AuctionParticipants({ auction }: { auction: AuctionAdmin }) {
  const [filter, setFilter] = useState<Filter>("ineligible");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("shortfall");

  const { data, isPending, error, refetch } = useParticipants(
    auction.id,
    filter === "ineligible" ? false : undefined,
  );

  const currency = auction.currency_code;
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (data?.items ?? []).filter((p) => {
      if (!term) return true;
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
      return (
        name.includes(term) ||
        p.handle.toLowerCase().includes(term) ||
        p.phone_e164.includes(term)
      );
    });
    return [...list].sort((a, b) => {
      if (sort === "shortfall") return b.shortfall_minor - a.shortfall_minor;
      if (sort === "balance") return a.balance_minor - b.balance_minor;
      return `${a.first_name ?? ""} ${a.last_name ?? ""} ${a.handle}`.localeCompare(
        `${b.first_name ?? ""} ${b.last_name ?? ""} ${b.handle}`,
      );
    });
  }, [data, search, sort]);

  const ineligibleWhoBid = rows.filter((p) => !p.is_eligible && p.has_bid);

  if (error) {
    return (
      <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Note tone="info">
        Eligibility is worked out from each bidder&apos;s balance against this
        auction&apos;s{" "}
        <strong>{formatMoney(auction.deposit_amount_minor, currency)}</strong>{" "}
        deposit. There is nothing to approve — record a deposit and the person
        becomes eligible straight away.
      </Note>

      {ineligibleWhoBid.length > 0 && (
        <Note tone="warning">
          {ineligibleWhoBid.length} {ineligibleWhoBid.length === 1 ? "person has" : "people have"} bid
          in this auction but no longer cover the deposit.
        </Note>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded border border-border p-0.5">
          {(["ineligible", "all"] as Filter[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-sm px-2.5 py-1 text-xs font-medium",
                filter === value
                  ? "bg-info-tint text-accent-strong"
                  : "text-text-muted hover:bg-surface-sunken hover:text-text",
              )}
            >
              {value === "ineligible" ? "Cannot bid" : "Everyone"}
            </button>
          ))}
        </div>

        <Input
          type="search"
          placeholder="Search name, handle or phone"
          aria-label="Search participants"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-64"
        />

        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          Sort
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            aria-label="Sort participants"
            className="h-7 rounded border border-border-strong bg-surface px-1.5 text-xs"
          >
            <option value="shortfall">Biggest shortfall</option>
            <option value="balance">Lowest balance</option>
            <option value="name">Name</option>
          </select>
        </label>

        <span className="tnum ml-auto text-xs text-text-muted">
          {rows.length} shown
        </span>
      </div>

      {isPending ? (
        <TableSkeleton columns={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            filter === "ineligible"
              ? "Everyone is covered"
              : "Nobody to show yet"
          }
          description={
            filter === "ineligible"
              ? "No one is short of this auction's deposit."
              : "Bidders appear here once they have an account."
          }
          action={
            filter === "ineligible" ? (
              <Button variant="secondary" onClick={() => setFilter("all")}>
                Show everyone
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken">
                <tr>
                  <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                    Bidder
                  </th>
                  <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                    Phone
                  </th>
                  <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                    Balance
                  </th>
                  <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                    Required
                  </th>
                  <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                    Short by
                  </th>
                  <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                    Can bid
                  </th>
                  <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                    Bid yet
                  </th>
                  <th className="w-28 px-2.5 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <ParticipantRow key={p.user_id} p={p} currency={currency} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ParticipantRow({
  p,
  currency,
}: {
  p: Participant;
  currency: string;
}) {
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
  const balance = describeBalance(p.balance_minor, currency);

  return (
    <tr className={cn("border-t border-border", !p.is_eligible && "bg-warning-tint")}>
      <td className="px-2.5 py-1.5">
        <Link
          href={`/users/${p.user_id}`}
          className="font-medium hover:underline"
        >
          {name || p.handle}
        </Link>
        {name && (
          <span className="block text-xs text-text-muted">{p.handle}</span>
        )}
      </td>
      {/* Shown because the operator phones these people; never in a URL. */}
      <td className="tnum px-2.5 py-1.5 font-mono text-xs">{p.phone_e164}</td>
      <td
        className={cn(
          "tnum px-2.5 py-1.5 text-right",
          balance.tone === "owing" && "text-danger-ink",
        )}
      >
        {formatMoney(p.balance_minor, currency)}
      </td>
      <td className="tnum px-2.5 py-1.5 text-right text-text-muted">
        {formatMoney(p.required_deposit_minor, currency)}
      </td>
      <td className="tnum px-2.5 py-1.5 text-right font-semibold text-warning-ink">
        {p.shortfall_minor > 0 ? formatMoney(p.shortfall_minor, currency) : ""}
      </td>
      <td className="px-2.5 py-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-xs font-medium",
            p.is_eligible
              ? "border-success-tint-border bg-success-tint text-success-ink"
              : "border-warning-tint-border bg-warning-tint text-warning-ink",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              p.is_eligible ? "bg-success" : "bg-warning",
            )}
          />
          {p.is_eligible ? "Yes" : "Not yet"}
        </span>
      </td>
      <td className="px-2.5 py-1.5 text-xs">
        {p.has_bid ? (
          <span className="tnum">
            {p.bid_count} bid{p.bid_count === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>
      <td className="px-2.5 py-1.5 text-right">
        <Link href={`/users/${p.user_id}`}>
          <Button size="sm" variant="secondary">
            Ledger
          </Button>
        </Link>
      </td>
    </tr>
  );
}
