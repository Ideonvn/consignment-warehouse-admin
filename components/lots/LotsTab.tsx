"use client";

import type { RowSelectionState } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Countdown } from "@/components/ui/Countdown";
import { DataTable, type CwColumnDef } from "@/components/ui/DataTable";
import {
  EmptyState,
  ErrorState,
  Note,
  TableSkeleton,
} from "@/components/ui/Feedback";
import { Input, Select } from "@/components/ui/Input";
import { LotProgressBadge, StatusBadge } from "@/components/ui/StatusBadge";
import { errorMessage } from "@/lib/api/errors";
import { useLots } from "@/lib/api/queries";
import { formatDateTime } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import { LOT_STATUS_META } from "@/lib/format/status";
import {
  lotStatusSchema,
  type AuctionAdmin,
  type LotAdminSummary,
  type LotStatus,
} from "@/types/api";
import { LotThumb } from "./LotThumb";
import { PublishLotDialog } from "./PublishLotDialog";

export function LotsTab({ auction }: { auction: AuctionAdmin }) {
  const router = useRouter();
  const { data, isPending, error, refetch } = useLots(auction.id);
  const [status, setStatus] = useState<LotStatus | "">("");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [publishing, setPublishing] = useState<LotAdminSummary | null>(null);

  const lots = useMemo(() => data ?? [], [data]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return lots
      .filter((lot) => (status ? lot.status === status : true))
      .filter((lot) =>
        term
          ? lot.title.toLowerCase().includes(term) ||
            String(lot.lot_number ?? "").includes(term)
          : true,
      );
  }, [lots, status, search]);

  const currency = auction.currency_code;

  // Counted over the whole auction, not the filtered rows: a lot bidders cannot
  // see is worth knowing about even while looking at a filtered view.
  const needsPublish = useMemo(
    () => lots.filter((lot) => lot.progress === "needs_publish"),
    [lots],
  );
  const abandoned = useMemo(
    () => lots.filter((lot) => lot.progress === "abandoned"),
    [lots],
  );

  const columns: CwColumnDef<LotAdminSummary>[] = useMemo(
    () => [
      {
        id: "lot_number",
        header: "#",
        accessorFn: (row) => row.lot_number ?? 0,
        sortFn: "basic",
        meta: { width: "3.5rem", align: "right" },
        cell: ({ row }) => (
          <span className="tnum text-text-muted">
            {row.original.lot_number ?? "—"}
          </span>
        ),
      },
      {
        id: "thumb",
        header: "",
        enableSorting: false,
        meta: { width: "3rem" },
        cell: ({ row }) => (
          <LotThumb
            url={row.original.primary_image_url}
            alt={`Primary image for ${row.original.title}`}
          />
        ),
      },
      {
        id: "title",
        header: "Title",
        accessorFn: (row) => row.title,
        sortFn: "text",
        cell: ({ row }) => (
          <Link
            href={`/lots/${row.original.id}`}
            className="font-medium hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (row) => row.status,
        sortFn: "text",
        meta: { width: "13rem" },
        cell: ({ row }) => (
          // Two axes, one colour language. The progress badge only appears when
          // it says something the status badge does not — which is exactly when
          // bidders cannot see the lot.
          <div className="flex flex-wrap items-center gap-1">
            <StatusBadge status={row.original.status} kind="lot" />
            <LotProgressBadge progress={row.original.progress} />
          </div>
        ),
      },
      {
        id: "starting_price_minor",
        header: "Start",
        accessorFn: (row) => row.starting_price_minor,
        sortFn: "basic",
        meta: { width: "7rem", align: "right" },
        cell: ({ row }) => formatMoney(row.original.starting_price_minor, currency),
      },
      {
        id: "reserve_price_minor",
        header: "Reserve",
        accessorFn: (row) => row.reserve_price_minor ?? -1,
        sortFn: "basic",
        meta: { width: "7rem", align: "right" },
        cell: ({ row }) =>
          row.original.reserve_price_minor === null ? (
            <span className="text-text-muted">none</span>
          ) : (
            formatMoney(row.original.reserve_price_minor, currency)
          ),
      },
      {
        id: "current_bid_minor",
        header: "Current bid",
        accessorFn: (row) => row.current_bid_minor ?? -1,
        sortFn: "basic",
        meta: { width: "8rem", align: "right" },
        cell: ({ row }) => {
          const lot = row.original;
          const belowReserve =
            lot.reserve_price_minor !== null &&
            (lot.current_bid_minor ?? 0) < lot.reserve_price_minor;
          return (
            <span
              className={belowReserve && lot.bid_count > 0 ? "text-warning-ink" : ""}
              title={
                belowReserve && lot.bid_count > 0
                  ? "Below the reserve"
                  : undefined
              }
            >
              {formatMoney(lot.current_bid_minor, currency, { emptyAs: "—" })}
            </span>
          );
        },
      },
      {
        id: "bid_count",
        header: "Bids",
        accessorFn: (row) => row.bid_count,
        sortFn: "basic",
        meta: { width: "4rem", align: "right" },
        cell: ({ row }) => <span className="tnum">{row.original.bid_count}</span>,
      },
      {
        id: "extension_count",
        header: "Ext",
        accessorFn: (row) => row.extension_count,
        sortFn: "basic",
        meta: { width: "4rem", align: "right" },
        cell: ({ row }) =>
          row.original.extension_count > 0 ? (
            <span
              className="tnum font-semibold text-warning-ink"
              title="Anti-snipe extensions earned by this lot"
            >
              +{row.original.extension_count}
            </span>
          ) : (
            <span className="tnum text-text-muted">0</span>
          ),
      },
      {
        id: "effective_ends_at",
        header: "Closes",
        accessorFn: (row) => row.effective_ends_at ?? "",
        sortFn: "datetime",
        meta: { width: "12rem" },
        cell: ({ row }) => {
          const lot = row.original;
          const open = lot.status === "live" || lot.status === "scheduled";
          return (
            <div className="flex flex-col leading-tight">
              <span className="tnum text-xs">
                {formatDateTime(lot.effective_ends_at)}
              </span>
              {open && (
                <Countdown to={lot.effective_ends_at} className="text-xs" />
              )}
            </div>
          );
        },
      },
      {
        id: "publish",
        header: "",
        enableSorting: false,
        meta: { width: "6rem", align: "right" },
        cell: ({ row }) =>
          // Listing stock into a running auction is repetitive, so the action is
          // on the row: opening each lot to publish it would be the same round
          // trip the create form was just fixed to avoid.
          row.original.progress === "needs_publish" ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={(event) => {
                event.stopPropagation();
                setPublishing(row.original);
              }}
            >
              Publish
            </Button>
          ) : null,
      },
    ],
    [currency],
  );

  const selectedCount = Object.values(selection).filter(Boolean).length;

  if (error) {
    return (
      <ErrorState
        message={errorMessage(error)}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {needsPublish.length > 0 && (
        <Note tone="warning">
          {needsPublish.length} lot{needsPublish.length === 1 ? "" : "s"} in this
          auction {needsPublish.length === 1 ? "is" : "are"} still a draft, so
          bidders cannot see {needsPublish.length === 1 ? "it" : "them"}. The
          auction was already published, which is what leaves a lot behind —
          publish {needsPublish.length === 1 ? "it" : "them"} from the rows below.
        </Note>
      )}
      {abandoned.length > 0 && (
        <Note tone="danger">
          {abandoned.length} lot{abandoned.length === 1 ? "" : "s"} never opened
          before this auction finished and can no longer be published. Relist{" "}
          {abandoned.length === 1 ? "it" : "them"} in another auction.
        </Note>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Search title or number"
          aria-label="Search lots"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-56"
        />
        <Select
          aria-label="Filter lots by status"
          value={status}
          onChange={(event) => setStatus(event.target.value as LotStatus | "")}
          className="w-48"
        >
          <option value="">All statuses</option>
          {lotStatusSchema.options.map((value) => (
            <option key={value} value={value}>
              {LOT_STATUS_META[value].label}
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
        <Button
          variant="primary"
          size="sm"
          className="ml-auto"
          onClick={() => router.push(`/auctions/${auction.id}/lots/new`)}
        >
          Add lots
        </Button>
        <span className="tnum text-xs text-text-muted">
          {rows.length} of {lots.length}
        </span>
      </div>

      {isPending ? (
        <TableSkeleton columns={9} />
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          enableSelection
          selection={selection}
          onSelectionChange={setSelection}
          onRowClick={(row) => router.push(`/lots/${row.id}`)}
          rowClassName={(row) =>
            row.status === "ended_reserve_not_met" ? "bg-warning-tint" : undefined
          }
          toolbar={
            selectedCount > 0 ? (
              <div className="flex items-center gap-3 border-b border-border bg-info-tint px-3 py-1.5 text-xs">
                <span className="font-medium">
                  {selectedCount} lot{selectedCount === 1 ? "" : "s"} selected
                </span>
                <span className="text-text-muted">
                  The backend has no bulk endpoints yet, so act on lots
                  individually for now.
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setSelection({})}
                >
                  Clear selection
                </Button>
              </div>
            ) : undefined
          }
          empty={
            lots.length === 0 ? (
              <EmptyState
                title="No lots in this auction"
                description="An auction cannot be published until it has at least one lot."
                action={
                  <Button
                    variant="primary"
                    onClick={() =>
                      router.push(`/auctions/${auction.id}/lots/new`)
                    }
                  >
                    Add lots
                  </Button>
                }
              />
            ) : (
              <EmptyState title="Nothing matches those filters" />
            )
          }
        />
      )}

      <PublishLotDialog
        lot={publishing}
        auctionStatus={auction.status}
        currency={currency}
        onClose={() => setPublishing(null)}
      />
    </div>
  );
}
