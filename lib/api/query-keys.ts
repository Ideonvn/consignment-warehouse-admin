/** Central query keys so invalidation after a mutation is never a guess. */
import type { ListAuctionsParams, ListUsersParams } from "./endpoints";

export const queryKeys = {
  me: ["me"] as const,

  auctions: (params: ListAuctionsParams = {}) => ["auctions", params] as const,
  auction: (auctionId: string) => ["auction", auctionId] as const,
  incrementRules: (auctionId: string) =>
    ["auction", auctionId, "increment-rules"] as const,

  lots: (auctionId: string) => ["auction", auctionId, "lots"] as const,
  lot: (lotId: string) => ["lot", lotId] as const,
  lotImages: (lotId: string) => ["lot", lotId, "images"] as const,
  lotBids: (lotId: string) => ["lot", lotId, "bids"] as const,

  users: (params: ListUsersParams = {}) => ["users", params] as const,
  user: (userId: string) => ["user", userId] as const,

  /** Every reserve-not-met lot across every auction, one page at a time. */
  decisionsRoot: ["decisions"] as const,
  decisions: (page: number) => ["decisions", "page", page] as const,
  decisionCount: ["decisions", "count"] as const,
};
