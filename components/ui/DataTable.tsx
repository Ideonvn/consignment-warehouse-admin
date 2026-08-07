"use client";

import {
  createSortedRowModel,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
  type RowSelectionState,
} from "@tanstack/react-table";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const features = tableFeatures({
  rowSortingFeature,
  rowSelectionFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
  // Phantom value: only the type is used, for per-column alignment.
  columnMeta: {} as { align?: "left" | "right"; width?: string },
});

export type CwColumnDef<TData extends RowData> = ColumnDef<typeof features, TData, unknown>;

export interface DataTableProps<TData extends RowData> {
  data: TData[];
  columns: CwColumnDef<TData>[];
  getRowId: (row: TData) => string;
  onRowClick?: (row: TData) => void;
  /** Highlights rows that need attention, e.g. reserve not met. */
  rowClassName?: (row: TData) => string | undefined;
  enableSelection?: boolean;
  selection?: RowSelectionState;
  onSelectionChange?: (next: RowSelectionState) => void;
  empty?: ReactNode;
  className?: string;
  /** Rendered above the table body, e.g. a bulk-action bar. */
  toolbar?: ReactNode;
}

/**
 * The operator lives in tables. Dense rows, sticky header, sortable columns,
 * keyboard-reachable rows.
 */
export function DataTable<TData extends RowData>({
  data,
  columns,
  getRowId,
  onRowClick,
  rowClassName,
  enableSelection = false,
  selection,
  onSelectionChange,
  empty,
  className,
  toolbar,
}: DataTableProps<TData>) {
  const table = useTable({
    features,
    data,
    columns,
    getRowId: (row) => getRowId(row),
    enableRowSelection: enableSelection,
    state: selection ? { rowSelection: selection } : undefined,
    onRowSelectionChange: onSelectionChange
      ? (updater) => {
          const next =
            typeof updater === "function"
              ? updater(selection ?? {})
              : updater;
          onSelectionChange(next ?? {});
        }
      : undefined,
  });

  const rows = table.getRowModel().rows;

  return (
    <div
      className={cn(
        "overflow-hidden rounded border border-border bg-surface",
        className,
      )}
    >
      {toolbar}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface-sunken">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortable = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const align = header.column.columnDef.meta?.align ?? "left";
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      style={
                        header.column.columnDef.meta?.width
                          ? { width: header.column.columnDef.meta.width }
                          : undefined
                      }
                      className={cn(
                        "border-b border-border px-2.5 py-1.5 text-xs font-semibold text-text-muted whitespace-nowrap",
                        align === "right" ? "text-right" : "text-left",
                      )}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-text"
                          aria-label={`Sort by ${String(header.column.id)}`}
                        >
                          <table.FlexRender header={header} />
                          <span aria-hidden className="text-[9px]">
                            {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : "⇅"}
                          </span>
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={table.getAllLeafColumns().length}
                  className="px-3 py-6"
                >
                  {empty ?? (
                    <p className="text-center text-sm text-text-muted">
                      Nothing here yet.
                    </p>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === "Enter") onRowClick(row.original);
                        }
                      : undefined
                  }
                  className={cn(
                    "border-b border-border last:border-b-0 hover:bg-surface-sunken",
                    onRowClick && "cursor-pointer",
                    rowClassName?.(row.original),
                  )}
                >
                  {row.getAllCells().map((cell) => {
                    const align = cell.column.columnDef.meta?.align ?? "left";
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          "px-2.5 py-1.5 align-middle",
                          align === "right" && "text-right tnum",
                        )}
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
