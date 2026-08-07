"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DataTable, type CwColumnDef } from "@/components/ui/DataTable";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/Feedback";
import { Input, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { RoleBadge, StatusBadge } from "@/components/ui/StatusBadge";
import { errorMessage } from "@/lib/api/errors";
import { useUsers } from "@/lib/api/queries";
import { formatDateTime, formatRelative } from "@/lib/format/datetime";
import { USER_ROLE_META, USER_STATUS_META } from "@/lib/format/status";
import {
  userRoleSchema,
  userStatusSchema,
  type AdminUser,
  type UserRole,
  type UserStatus,
} from "@/types/api";

const PAGE_SIZE = 50;

export default function UsersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<UserStatus | "">("");
  const [role, setRole] = useState<UserRole | "">("");
  const [page, setPage] = useState(0);

  const { data, isPending, error, refetch, isFetching } = useUsers({
    search: search.trim() || undefined,
    status: status || undefined,
    role: role || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const users = useMemo(() => data ?? [], [data]);
  // The endpoint is offset-paginated with no total, so a full page means
  // "there might be more".
  const hasMore = users.length === PAGE_SIZE;

  const columns: CwColumnDef<AdminUser>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Name",
        accessorFn: (row) =>
          [row.first_name, row.last_name].filter(Boolean).join(" "),
        sortFn: "text",
        cell: ({ row }) => {
          const name = [row.original.first_name, row.original.last_name]
            .filter(Boolean)
            .join(" ");
          return (
            <Link
              href={`/users/${row.original.id}`}
              className="font-medium hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {name || <span className="text-text-muted">No name given</span>}
            </Link>
          );
        },
      },
      {
        id: "phone",
        header: "Phone",
        accessorFn: (row) => row.phone_e164,
        sortFn: "text",
        meta: { width: "10rem" },
        cell: ({ row }) => (
          <span className="tnum font-mono text-xs">
            {row.original.phone_e164}
          </span>
        ),
      },
      {
        id: "role",
        header: "Role",
        accessorFn: (row) => row.role,
        sortFn: "text",
        meta: { width: "8rem" },
        cell: ({ row }) => <RoleBadge role={row.original.role} />,
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (row) => row.status,
        sortFn: "text",
        meta: { width: "8rem" },
        cell: ({ row }) => (
          <StatusBadge status={row.original.status} kind="user" />
        ),
      },
      {
        id: "last_login_at",
        header: "Last login",
        accessorFn: (row) => row.last_login_at ?? "",
        sortFn: "datetime",
        meta: { width: "11rem" },
        cell: ({ row }) =>
          row.original.last_login_at ? (
            <span
              className="tnum text-xs"
              title={formatDateTime(row.original.last_login_at)}
            >
              {formatRelative(row.original.last_login_at)}
            </span>
          ) : (
            <span className="text-text-muted">never</span>
          ),
      },
      {
        id: "created_at",
        header: "Joined",
        accessorFn: (row) => row.created_at,
        sortFn: "datetime",
        meta: { width: "11rem" },
        cell: ({ row }) => (
          <span className="tnum text-xs">
            {formatDateTime(row.original.created_at)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Bidders and colleagues. Phone numbers are shown here because you need them; they are never put in a URL."
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Search phone, first or last name"
          aria-label="Search users"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
          className="w-72"
        />
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as UserStatus | "");
            setPage(0);
          }}
          className="w-40"
        >
          <option value="">All statuses</option>
          {userStatusSchema.options.map((value) => (
            <option key={value} value={value}>
              {USER_STATUS_META[value].label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by role"
          value={role}
          onChange={(event) => {
            setRole(event.target.value as UserRole | "");
            setPage(0);
          }}
          className="w-40"
        >
          <option value="">All roles</option>
          {userRoleSchema.options.map((value) => (
            <option key={value} value={value}>
              {USER_ROLE_META[value].label}
            </option>
          ))}
        </Select>
        {(search || status || role) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setStatus("");
              setRole("");
              setPage(0);
            }}
          >
            Clear
          </Button>
        )}
        <span className="tnum ml-auto text-xs text-text-muted">
          {isFetching ? "Loading…" : `${users.length} shown`}
        </span>
      </div>

      {error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : isPending ? (
        <TableSkeleton columns={6} />
      ) : (
        <>
          <DataTable
            data={users}
            columns={columns}
            getRowId={(row) => row.id}
            onRowClick={(row) => router.push(`/users/${row.id}`)}
            empty={
              <EmptyState
                title="No users match that"
                description="Try a partial phone number, or clear the filters."
              />
            }
          />

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
            <span className="tnum text-xs text-text-muted">Page {page + 1}</span>
          </div>
        </>
      )}
    </>
  );
}
