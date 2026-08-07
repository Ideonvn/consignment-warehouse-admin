"use client";

import { useQueries } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Countdown } from "@/components/ui/Countdown";
import { DataTable, type CwColumnDef } from "@/components/ui/DataTable";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/Feedback";
import { Input, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { listLots } from "@/lib/api/endpoints";
import { useAuctions } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { errorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/format/datetime";
import { AUCTION_STATUS_META } from "@/lib/format/status";
import { auctionStatusSchema, type AuctionAdmin, type AuctionStatus } from "@/types/api";

export default function AuctionsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<AuctionStatus | "">("");
  const [search, setSearch] = useState("");

  const { data, isPending, error, refetch } = useAuctions({ limit: 200 });

  // AuctionAdminOut has no lot count, so it is fetched per row. Long stale time
  // keeps this cheap; recorded in NOTES.md as a backend request.
  const lotCounts = useQueries({
    queries: (data ?? []).map((auction) => ({
      queryKey: queryKeys.lots(auction.id),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        listLots(auction.id, signal),
      staleTime: 60_000,
    })),
    combine: (results) => {
      const map = new Map<string, number | null>();
      (data ?? []).forEach((auction, index) => {
        const result = results[index];
        map.set(auction.id, result?.data ? result.data.length : null);
      });
      return map;
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? [])
      .filter((a) => (status ? a.status === status : true))
      .filter((a) =>
        term
          ? a.name.toLowerCase().includes(term) ||
            a.slug.toLowerCase().includes(term)
          : true,
      );
  }, [data, status, search]);

  const columns: CwColumnDef<AuctionAdmin>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Auction",
        accessorFn: (row) => row.name,
        sortFn: "text",
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <Link
              href={`/auctions/${row.original.id}`}
              className="truncate font-medium hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {row.original.name}
            </Link>
            <span className="truncate font-mono text-xs text-text-muted">
              {row.original.slug}
            </span>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (row) => row.status,
        sortFn: "text",
        meta: { width: "9rem" },
        cell: ({ row }) => (
          <StatusBadge status={row.original.status} kind="auction" />
        ),
      },
      {
        id: "starts_at",
        header: "Opens",
        accessorFn: (row) => row.starts_at,
        sortFn: "datetime",
        meta: { width: "13rem" },
        cell: ({ row }) => (
          <span className="tnum text-xs">
            {formatDateTime(row.original.starts_at)}
          </span>
        ),
      },
      {
        id: "ends_at",
        header: "Closes",
        accessorFn: (row) => row.ends_at,
        sortFn: "datetime",
        meta: { width: "13rem" },
        cell: ({ row }) => (
          <span className="tnum text-xs">
            {formatDateTime(row.original.ends_at)}
          </span>
        ),
      },
      {
        id: "countdown",
        header: "Time left",
        enableSorting: false,
        meta: { width: "7rem", align: "right" },
        cell: ({ row }) => {
          const a = row.original;
          if (a.status === "live") return <Countdown to={a.ends_at} />;
          if (a.status === "scheduled") {
            return (
              <span className="text-xs text-text-muted">
                opens <Countdown to={a.starts_at} className="text-xs" />
              </span>
            );
          }
          return <span className="text-text-muted">—</span>;
        },
      },
      {
        id: "lots",
        header: "Lots",
        enableSorting: false,
        meta: { width: "4.5rem", align: "right" },
        cell: ({ row }) => {
          const count = lotCounts.get(row.original.id);
          return count === null || count === undefined ? (
            <span className="text-text-muted">·</span>
          ) : (
            <span className="tnum">{count}</span>
          );
        },
      },
    ],
    [lotCounts],
  );

  return (
    <>
      <PageHeader
        title="Auctions"
        subtitle="Every auction, including drafts that bidders cannot see."
        actions={
          <Button variant="primary" onClick={() => router.push("/auctions/new")}>
            New auction
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Search name or slug"
          aria-label="Search auctions"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-56"
        />
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as AuctionStatus | "")
          }
          className="w-44"
        >
          <option value="">All statuses</option>
          {auctionStatusSchema.options.map((value) => (
            <option key={value} value={value}>
              {AUCTION_STATUS_META[value].label}
            </option>
          ))}
        </Select>
        {(search || status) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setStatus("");
            }}
          >
            Clear
          </Button>
        )}
        <span className="tnum ml-auto text-xs text-text-muted">
          {rows.length} of {data?.length ?? 0}
        </span>
      </div>

      {error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : isPending ? (
        <TableSkeleton columns={6} />
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          onRowClick={(row) => router.push(`/auctions/${row.id}`)}
          empty={
            data && data.length === 0 ? (
              <EmptyState
                title="No auctions yet"
                description="Create one, add lots to it, then publish it for bidders."
                action={
                  <Button
                    variant="primary"
                    onClick={() => router.push("/auctions/new")}
                  >
                    New auction
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="Nothing matches those filters"
                description="Try a different status or clear the search."
              />
            )
          }
        />
      )}
    </>
  );
}
