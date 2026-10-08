"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { isSuperadmin, useSessionStore } from "@/lib/auth";
import type { AuctionAdmin, LotAdminSummary, UserRole } from "@/types/api";
import * as api from "./endpoints";
import { queryKeys } from "./query-keys";

/** Queries only run once a session exists; otherwise every screen 401s on load. */
function useAuthed() {
  return useSessionStore((s) => s.status === "authenticated");
}

/* --------------------------------------------------------------- auctions */

export function useAuctions(params: api.ListAuctionsParams = {}) {
  const enabled = useAuthed();
  return useQuery({
    queryKey: queryKeys.auctions(params),
    queryFn: ({ signal }) => api.listAuctions(params, signal),
    enabled,
  });
}

export function useAuction(
  auctionId: string | undefined,
  options?: Partial<UseQueryOptions<AuctionAdmin>>,
) {
  const enabled = useAuthed();
  return useQuery({
    queryKey: queryKeys.auction(auctionId ?? ""),
    queryFn: ({ signal }) => api.getAuction(auctionId!, signal),
    enabled: enabled && Boolean(auctionId),
    ...options,
  });
}

export function useIncrementRules(auctionId: string | undefined) {
  const enabled = useAuthed();
  return useQuery({
    queryKey: queryKeys.incrementRules(auctionId ?? ""),
    queryFn: ({ signal }) => api.listIncrementRules(auctionId!, signal),
    enabled: enabled && Boolean(auctionId),
  });
}

/* ------------------------------------------------------------------- lots */

export function useLots(
  auctionId: string | undefined,
  options?: { refetchInterval?: number },
) {
  const enabled = useAuthed();
  return useQuery({
    queryKey: queryKeys.lots(auctionId ?? ""),
    queryFn: ({ signal }) => api.listLots(auctionId!, signal),
    enabled: enabled && Boolean(auctionId),
    refetchInterval: options?.refetchInterval,
  });
}

export function useLot(lotId: string | undefined) {
  const enabled = useAuthed();
  return useQuery({
    queryKey: queryKeys.lot(lotId ?? ""),
    queryFn: ({ signal }) => api.getLot(lotId!, signal),
    enabled: enabled && Boolean(lotId),
  });
}

export function useLotImages(lotId: string | undefined) {
  const enabled = useAuthed();
  return useQuery({
    queryKey: queryKeys.lotImages(lotId ?? ""),
    queryFn: ({ signal }) => api.listLotImages(lotId!, signal),
    enabled: enabled && Boolean(lotId),
  });
}

export function useLotBids(lotId: string | undefined) {
  const enabled = useAuthed();
  return useQuery({
    queryKey: queryKeys.lotBids(lotId ?? ""),
    queryFn: ({ signal }) => api.listLotBids(lotId!, { limit: 50 }, signal),
    enabled: enabled && Boolean(lotId),
  });
}

/* ------------------------------------------------------------------ users */

export function useUsers(params: api.ListUsersParams) {
  const enabled = useAuthed();
  return useQuery({
    queryKey: queryKeys.users(params),
    queryFn: ({ signal }) => api.listUsers(params, signal),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useUser(userId: string | undefined) {
  const enabled = useAuthed();
  return useQuery({
    queryKey: queryKeys.user(userId ?? ""),
    queryFn: ({ signal }) => api.getUser(userId!, signal),
    enabled: enabled && Boolean(userId),
  });
}

/* ----------------------------------------------------------------- ledger */

export const LEDGER_PAGE_SIZE = 25;

export function useUserLedger(userId: string | undefined, page = 0) {
  const enabled = useAuthed();
  return useQuery({
    queryKey: queryKeys.ledger(userId ?? "", page),
    queryFn: ({ signal }) =>
      api.getUserLedger(
        userId!,
        { limit: LEDGER_PAGE_SIZE, offset: page * LEDGER_PAGE_SIZE },
        signal,
      ),
    enabled: enabled && Boolean(userId),
    placeholderData: (previous) => previous,
  });
}

/* ---------------------------------------------------------- deposit book */

export const DEPOSIT_PAGE_SIZE = 25;

export function useUserDeposit(userId: string | undefined, page = 0) {
  const enabled = useAuthed();
  return useQuery({
    queryKey: queryKeys.deposit(userId ?? "", page),
    queryFn: ({ signal }) =>
      api.getUserDeposit(
        userId!,
        { limit: DEPOSIT_PAGE_SIZE, offset: page * DEPOSIT_PAGE_SIZE },
        signal,
      ),
    enabled: enabled && Boolean(userId),
    placeholderData: (previous) => previous,
  });
}

export function useParticipants(
  auctionId: string | undefined,
  eligible: boolean | undefined,
) {
  const enabled = useAuthed();
  return useQuery({
    queryKey: queryKeys.participants(auctionId ?? "", eligible),
    queryFn: ({ signal }) =>
      api.listParticipants(auctionId!, { eligible, limit: 200 }, signal),
    enabled: enabled && Boolean(auctionId),
    placeholderData: (previous) => previous,
  });
}

/* ------------------------------------------------------------ outstanding */

export const OUTSTANDING_PAGE_SIZE = 50;

/** Debtors, most owing first. The server orders them; nothing is re-sorted here. */
export function useOutstanding(page = 0) {
  const enabled = useAuthed();
  return useQuery<api.OutstandingPage>({
    queryKey: queryKeys.outstanding(page),
    enabled,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
    queryFn: ({ signal }) =>
      api.listOutstanding(
        {
          limit: OUTSTANDING_PAGE_SIZE,
          offset: page * OUTSTANDING_PAGE_SIZE,
        },
        signal,
      ),
  });
}

/**
 * The sidebar badge counts **people**, not rands.
 *
 * The operator works this screen person by person — they phone someone, then
 * record what arrives — so the number of names left is the thing that maps onto
 * an action. A rand total moves every time any balance changes without the
 * worklist getting any shorter, and "R70 392,50" cannot be read at badge size
 * anyway. The total is on the screen itself, where there is room for it.
 *
 * Its own small query, like the decisions badge, so it does not depend on which
 * page of the list is open.
 */
export function useOutstandingCount(): number {
  const enabled = useAuthed();
  const { data } = useQuery<api.OutstandingPage>({
    queryKey: queryKeys.outstandingCount,
    enabled,
    staleTime: 30_000,
    queryFn: ({ signal }) => api.listOutstanding({ limit: 200 }, signal),
  });
  return data?.items.length ?? 0;
}

/* --------------------------------------------------------------- invoices */

export const INVOICES_PAGE_SIZE = 50;

/**
 * Issued invoices, newest first.
 *
 * ⚠️ With `unpaid` on, the backend filters AFTER summing the allocations, so a
 * page can come back shorter than `INVOICES_PAGE_SIZE` with more behind it. The
 * screen must page on `hasMore`, never on "did I get a full page".
 */
export function useInvoices(
  params: Omit<api.ListInvoicesParams, "limit" | "offset"> = {},
  page = 0,
) {
  const enabled = useAuthed();
  const full: api.ListInvoicesParams = {
    ...params,
    limit: INVOICES_PAGE_SIZE,
    offset: page * INVOICES_PAGE_SIZE,
  };
  // Explicit generic: `placeholderData: (previous) => previous` makes the
  // inferred result `{}` here, exactly as it does on the decisions query.
  return useQuery<api.InvoicesPage>({
    queryKey: queryKeys.invoices(full),
    enabled,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
    queryFn: ({ signal }) => api.listInvoices(full, signal),
  });
}

export function useInvoice(invoiceId: string | undefined) {
  const enabled = useAuthed();
  return useQuery({
    queryKey: queryKeys.invoice(invoiceId ?? ""),
    queryFn: ({ signal }) => api.getInvoice(invoiceId!, signal),
    enabled: enabled && Boolean(invoiceId),
  });
}

/**
 * One bidder's invoices that still have money on them — what the allocation
 * control on the payment form offers.
 *
 * Deliberately **not paged**: an operator allocating a bank line is choosing
 * among this person's open documents, and a second page of them would mean
 * something has gone badly wrong operationally rather than that the control
 * needs pagination.
 */
export function useUnpaidInvoicesFor(userId: string | undefined) {
  const enabled = useAuthed();
  return useQuery<api.InvoicesPage>({
    queryKey: queryKeys.invoices({ userId, unpaid: true, limit: 200 }),
    enabled: enabled && Boolean(userId),
    staleTime: 15_000,
    queryFn: ({ signal }) =>
      api.listInvoices({ userId, unpaid: true, limit: 200 }, signal),
  });
}

/**
 * Everything a posted payment or a fresh issue could have changed.
 *
 * The whole `invoices` subtree goes rather than one key: an allocation changes
 * the DERIVED status of an invoice sitting on a page nobody can predict from
 * here, and the `unpaid` filter means a row can leave a list it was on.
 */
export function useInvoiceInvalidation() {
  const client = useQueryClient();
  return (invoiceId?: string) => {
    void client.invalidateQueries({ queryKey: queryKeys.invoicesRoot });
    if (invoiceId) {
      void client.invalidateQueries({ queryKey: queryKeys.invoice(invoiceId) });
    }
  };
}

/* -------------------------------------------------------------- decisions */

export const DECISIONS_PAGE_SIZE = 50;

/**
 * Lots waiting on a decision, straight from the cross-auction lots endpoint.
 * The server returns them ordered by closing time, so nothing is re-sorted
 * here — one call, whatever the number of auctions.
 */
export function useDecisions(page = 0) {
  const enabled = useAuthed();
  return useQuery<LotAdminSummary[]>({
    queryKey: queryKeys.decisions(page),
    enabled,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
    queryFn: ({ signal }) =>
      api.listAdminLots(
        {
          status: "ended_reserve_not_met",
          limit: DECISIONS_PAGE_SIZE,
          offset: page * DECISIONS_PAGE_SIZE,
        },
        signal,
      ),
  });
}

/**
 * Badge count for the sidebar. Its own small query so the badge does not depend
 * on which page of the queue the operator happens to be looking at.
 */
export function useDecisionCount(): number {
  const enabled = useAuthed();
  const { data } = useQuery<LotAdminSummary[]>({
    queryKey: queryKeys.decisionCount,
    enabled,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      api.listAdminLots(
        { status: "ended_reserve_not_met", limit: 200 },
        signal,
      ),
  });
  return data?.length ?? 0;
}

/* -------------------------------------------------------------- mutations */

/** Invalidate everything a lot mutation could have touched. */
export function useLotInvalidation() {
  const client = useQueryClient();
  return (lot: { id: string; auction_id: string }) => {
    void client.invalidateQueries({ queryKey: queryKeys.lot(lot.id) });
    void client.invalidateQueries({ queryKey: queryKeys.lots(lot.auction_id) });
    void client.invalidateQueries({ queryKey: queryKeys.decisionsRoot });
  };
}

export function useAuctionInvalidation() {
  const client = useQueryClient();
  return (auctionId: string) => {
    void client.invalidateQueries({ queryKey: queryKeys.auction(auctionId) });
    void client.invalidateQueries({ queryKey: ["auctions"] });
    void client.invalidateQueries({ queryKey: queryKeys.lots(auctionId) });
  };
}

/* ---------------------------------------------------------- demo sign-ins */

/**
 * Demo sign-ins, superadmin only.
 *
 * Gated in `enabled` as well as on the screen, deliberately: an ordinary admin
 * landing on /settings would otherwise fire a request that comes back 403 and
 * shows up as an error state rather than as a page that is not for them. The
 * backend is still the authority — this only keeps the portal from asking.
 */
export function useDemoLogins() {
  const role = useCurrentRole();
  const enabled = useAuthed() && isSuperadmin(role);
  return useQuery({
    queryKey: queryKeys.demoLogins,
    enabled,
    queryFn: ({ signal }) => api.listDemoLogins(signal),
  });
}

export function useCurrentRole(): UserRole | null {
  return useSessionStore((s) => s.user?.role ?? null);
}

export { useMutation };
