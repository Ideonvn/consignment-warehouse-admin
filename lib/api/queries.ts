"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useSessionStore } from "@/lib/auth";
import type {
  AuctionAdmin,
  LotAdminSummary,
  UserRole,
} from "@/types/api";
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

/* -------------------------------------------------------------- decisions */

export interface DecisionLot {
  lot: LotAdminSummary;
  auction: AuctionAdmin;
}

/**
 * Every lot sitting in `ended_reserve_not_met`, across every auction.
 *
 * There is no cross-auction lot endpoint, so this fans out over the auctions
 * that could plausibly hold one (anything past draft/scheduled). Recorded in
 * NOTES.md as a backend request.
 */
export function useDecisions() {
  const enabled = useAuthed();
  return useQuery({
    queryKey: queryKeys.decisions,
    enabled,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const auctions = await api.listAuctions({ limit: 200 }, signal);
      const candidates = auctions.filter(
        (a) => a.status === "live" || a.status === "ended" || a.status === "settled",
      );
      const results = await Promise.all(
        candidates.map(async (auction) => {
          const lots = await api.listLots(auction.id, signal);
          return lots
            .filter((lot) => lot.status === "ended_reserve_not_met")
            .map((lot) => ({ lot, auction }));
        }),
      );
      return results
        .flat()
        .sort((a, b) =>
          (a.lot.effective_ends_at ?? "").localeCompare(
            b.lot.effective_ends_at ?? "",
          ),
        );
    },
  });
}

export function useDecisionCount(): number {
  const { data } = useDecisions();
  return data?.length ?? 0;
}

/* -------------------------------------------------------------- mutations */

/** Invalidate everything a lot mutation could have touched. */
export function useLotInvalidation() {
  const client = useQueryClient();
  return (lot: { id: string; auction_id: string }) => {
    void client.invalidateQueries({ queryKey: queryKeys.lot(lot.id) });
    void client.invalidateQueries({ queryKey: queryKeys.lots(lot.auction_id) });
    void client.invalidateQueries({ queryKey: queryKeys.decisions });
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
