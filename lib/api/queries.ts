"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useSessionStore } from "@/lib/auth";
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

export function useCurrentRole(): UserRole | null {
  return useSessionStore((s) => s.user?.role ?? null);
}

export { useMutation };
