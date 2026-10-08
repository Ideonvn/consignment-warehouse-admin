/** Central query keys so invalidation after a mutation is never a guess. */
import type {
  ListAuctionsParams,
  ListInvoicesParams,
  ListUsersParams,
} from "./endpoints";

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

  ledgerRoot: (userId: string) => ["user", userId, "ledger"] as const,
  ledger: (userId: string, page: number) =>
    ["user", userId, "ledger", page] as const,

  /** The security-deposit book — a different number from the ledger's balance. */
  depositRoot: (userId: string) => ["user", userId, "deposit"] as const,
  deposit: (userId: string, page: number) =>
    ["user", userId, "deposit", page] as const,

  participants: (auctionId: string, eligible: boolean | undefined) =>
    ["auction", auctionId, "participants", eligible ?? "all"] as const,

  /**
   * Issued invoices. `invoicesRoot` is what a posted payment invalidates — an
   * allocation changes the derived status of an invoice on a page nobody can
   * predict, so the whole subtree goes rather than one key.
   */
  invoicesRoot: ["invoices"] as const,
  invoices: (params: ListInvoicesParams = {}) => ["invoices", params] as const,
  invoice: (invoiceId: string) => ["invoice", invoiceId] as const,

  /** Everyone who owes money, one page at a time, plus the count for the nav. */
  outstandingRoot: ["outstanding"] as const,
  outstanding: (page: number) => ["outstanding", "page", page] as const,
  outstandingCount: ["outstanding", "count"] as const,

  /**
   * Demo sign-ins. One flat key — there are a handful by construction, one per
   * store review channel, so the endpoint takes no paging and neither does this.
   */
  demoLogins: ["demo-logins"] as const,

  /** Every reserve-not-met lot across every auction, one page at a time. */
  decisionsRoot: ["decisions"] as const,
  decisions: (page: number) => ["decisions", "page", page] as const,
  decisionCount: ["decisions", "count"] as const,
};
