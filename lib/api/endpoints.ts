/**
 * Every backend call this portal makes, in one typed place.
 * Screens use the react-query hooks in lib/api/queries.ts, not these directly.
 */
import { z } from "zod";
import {
  adminUserDetailSchema,
  adminUserSchema,
  auctionAdminSchema,
  auctionMutationSchema,
  bidSchema,
  confirmImageSchema,
  incrementRuleSchema,
  lotAdminDetailSchema,
  lotAdminSummarySchema,
  lotImageAdminSchema,
  presignResultSchema,
  voidBidResultSchema,
  wsTicketSchema,
  type AdminUser,
  type AdminUserDetail,
  type AuctionAdmin,
  type AuctionMutation,
  type AuctionStatus,
  type Bid,
  type ChangeRoleInput,
  type ConfirmImageInput,
  type CreateAuctionInput,
  type CreateIncrementRuleInput,
  type CreateLotInput,
  type CursorPage,
  type IncrementRule,
  type LotAdminDetail,
  type LotAdminSummary,
  type LotImageAdmin,
  type LotStatus,
  type PresignRequestInput,
  type PresignResult,
  type RelistLotInput,
  type UpdateAuctionInput,
  type UpdateImageInput,
  type UpdateLotInput,
  type UserRole,
  type UserStatus,
  type VoidBidResult,
  type WsTicket,
} from "@/types/api";
import { apiRequest, apiRequestPaged, apiRequestVoid } from "./client";

const auctionListSchema = z.array(auctionAdminSchema);
const lotListSchema = z.array(lotAdminSummarySchema);
const ruleListSchema = z.array(incrementRuleSchema);
const imageListSchema = z.array(lotImageAdminSchema);
const userListSchema = z.array(adminUserSchema);
const bidListSchema = z.array(bidSchema);

/* --------------------------------------------------------------- auctions */

export interface ListAuctionsParams {
  status?: AuctionStatus | "";
  limit?: number;
  offset?: number;
}

export function listAuctions(
  params: ListAuctionsParams = {},
  signal?: AbortSignal,
): Promise<AuctionAdmin[]> {
  return apiRequest("/admin/auctions", {
    schema: auctionListSchema,
    query: {
      status: params.status || undefined,
      limit: params.limit ?? 100,
      offset: params.offset ?? 0,
    },
    signal,
  });
}

export function getAuction(
  auctionId: string,
  signal?: AbortSignal,
): Promise<AuctionAdmin> {
  return apiRequest(`/admin/auctions/${auctionId}`, {
    schema: auctionAdminSchema,
    signal,
  });
}

export function createAuction(body: CreateAuctionInput): Promise<AuctionAdmin> {
  return apiRequest("/admin/auctions", {
    method: "POST",
    body,
    schema: auctionAdminSchema,
  });
}

export function updateAuction(
  auctionId: string,
  body: UpdateAuctionInput,
): Promise<AuctionMutation> {
  return apiRequest(`/admin/auctions/${auctionId}`, {
    method: "PATCH",
    body,
    schema: auctionMutationSchema,
  });
}

export function publishAuction(auctionId: string): Promise<AuctionAdmin> {
  return apiRequest(`/admin/auctions/${auctionId}/publish`, {
    method: "POST",
    body: {},
    schema: auctionAdminSchema,
  });
}

export function cancelAuction(
  auctionId: string,
  reason: string,
): Promise<AuctionMutation> {
  return apiRequest(`/admin/auctions/${auctionId}/cancel`, {
    method: "POST",
    body: { reason },
    schema: auctionMutationSchema,
  });
}

/* -------------------------------------------------------- increment rules */

export function listIncrementRules(
  auctionId: string,
  signal?: AbortSignal,
): Promise<IncrementRule[]> {
  return apiRequest(`/admin/auctions/${auctionId}/increment-rules`, {
    schema: ruleListSchema,
    signal,
  });
}

export function createIncrementRule(
  auctionId: string,
  body: CreateIncrementRuleInput,
): Promise<IncrementRule> {
  return apiRequest(`/admin/auctions/${auctionId}/increment-rules`, {
    method: "POST",
    body,
    schema: incrementRuleSchema,
  });
}

export function deleteIncrementRule(
  auctionId: string,
  ruleId: string,
): Promise<void> {
  return apiRequestVoid(
    `/admin/auctions/${auctionId}/increment-rules/${ruleId}`,
    { method: "DELETE" },
  );
}

/* ------------------------------------------------------------------- lots */

export function listLots(
  auctionId: string,
  signal?: AbortSignal,
): Promise<LotAdminSummary[]> {
  return apiRequest(`/admin/auctions/${auctionId}/lots`, {
    schema: lotListSchema,
    signal,
  });
}

export interface ListAdminLotsParams {
  status?: LotStatus | "";
  auctionId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Lots across every auction, filtered by status. Already ordered by
 * `effective_ends_at` then `lot_number`, so callers must not re-sort.
 */
export function listAdminLots(
  params: ListAdminLotsParams = {},
  signal?: AbortSignal,
): Promise<LotAdminSummary[]> {
  return apiRequest("/admin/lots", {
    schema: lotListSchema,
    query: {
      status: params.status || undefined,
      auction_id: params.auctionId || undefined,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
    signal,
  });
}

export function getLot(
  lotId: string,
  signal?: AbortSignal,
): Promise<LotAdminDetail> {
  return apiRequest(`/admin/lots/${lotId}`, {
    schema: lotAdminDetailSchema,
    signal,
  });
}

export function createLot(
  auctionId: string,
  body: CreateLotInput,
): Promise<LotAdminSummary> {
  return apiRequest(`/admin/auctions/${auctionId}/lots`, {
    method: "POST",
    body,
    schema: lotAdminSummarySchema,
  });
}

export function updateLot(
  lotId: string,
  body: UpdateLotInput,
): Promise<LotAdminSummary> {
  return apiRequest(`/admin/lots/${lotId}`, {
    method: "PATCH",
    body,
    schema: lotAdminSummarySchema,
  });
}

export function withdrawLot(
  lotId: string,
  reason: string,
): Promise<LotAdminSummary> {
  return apiRequest(`/admin/lots/${lotId}/withdraw`, {
    method: "POST",
    body: { reason },
    schema: lotAdminSummarySchema,
  });
}

export function deleteLot(lotId: string): Promise<void> {
  return apiRequestVoid(`/admin/lots/${lotId}`, { method: "DELETE" });
}

export function acceptReserve(
  lotId: string,
  reason: string,
): Promise<LotAdminSummary> {
  return apiRequest(`/admin/lots/${lotId}/accept-reserve`, {
    method: "POST",
    body: { reason },
    schema: lotAdminSummarySchema,
  });
}

export function relistLot(
  lotId: string,
  body: RelistLotInput,
): Promise<LotAdminSummary> {
  return apiRequest(`/admin/lots/${lotId}/relist`, {
    method: "POST",
    body,
    schema: lotAdminSummarySchema,
  });
}

/* ------------------------------------------------------------------- bids */

export async function listLotBids(
  lotId: string,
  params: { cursor?: string | null; limit?: number } = {},
  signal?: AbortSignal,
): Promise<CursorPage<Bid>> {
  const result = await apiRequestPaged(`/lots/${lotId}/bids`, {
    schema: bidListSchema,
    query: { cursor: params.cursor ?? undefined, limit: params.limit ?? 50 },
    signal,
  });
  return {
    items: result.data,
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
  };
}

export function voidBid(bidId: string, reason: string): Promise<VoidBidResult> {
  return apiRequest(`/admin/bids/${bidId}/void`, {
    method: "POST",
    body: { reason },
    schema: voidBidResultSchema,
  });
}

/* ----------------------------------------------------------------- images */

export function listLotImages(
  lotId: string,
  signal?: AbortSignal,
): Promise<LotImageAdmin[]> {
  return apiRequest(`/admin/lots/${lotId}/images`, {
    schema: imageListSchema,
    signal,
  });
}

export function presignLotImage(
  lotId: string,
  body: PresignRequestInput,
): Promise<PresignResult> {
  return apiRequest(`/admin/lots/${lotId}/images/presign`, {
    method: "POST",
    body,
    schema: presignResultSchema,
  });
}

export function confirmLotImage(
  lotId: string,
  body: ConfirmImageInput,
): Promise<LotImageAdmin> {
  return apiRequest(`/admin/lots/${lotId}/images`, {
    method: "POST",
    body: confirmImageSchema.parse(body),
    schema: lotImageAdminSchema,
  });
}

export function updateLotImage(
  lotId: string,
  imageId: string,
  body: UpdateImageInput,
): Promise<LotImageAdmin> {
  return apiRequest(`/admin/lots/${lotId}/images/${imageId}`, {
    method: "PATCH",
    body,
    schema: lotImageAdminSchema,
  });
}

export function deleteLotImage(lotId: string, imageId: string): Promise<void> {
  return apiRequestVoid(`/admin/lots/${lotId}/images/${imageId}`, {
    method: "DELETE",
  });
}

/* ------------------------------------------------------------------ users */

export interface ListUsersParams {
  search?: string;
  status?: UserStatus | "";
  role?: UserRole | "";
  limit?: number;
  offset?: number;
}

export function listUsers(
  params: ListUsersParams = {},
  signal?: AbortSignal,
): Promise<AdminUser[]> {
  return apiRequest("/admin/users", {
    schema: userListSchema,
    query: {
      search: params.search || undefined,
      status: params.status || undefined,
      role: params.role || undefined,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
    signal,
  });
}

export function getUser(
  userId: string,
  signal?: AbortSignal,
): Promise<AdminUserDetail> {
  return apiRequest(`/admin/users/${userId}`, {
    schema: adminUserDetailSchema,
    signal,
  });
}

export function suspendUser(
  userId: string,
  reason: string,
): Promise<AdminUser> {
  return apiRequest(`/admin/users/${userId}/suspend`, {
    method: "POST",
    body: { reason },
    schema: adminUserSchema,
  });
}

export function reactivateUser(
  userId: string,
  reason: string,
): Promise<AdminUser> {
  return apiRequest(`/admin/users/${userId}/reactivate`, {
    method: "POST",
    body: { reason },
    schema: adminUserSchema,
  });
}

export function changeUserRole(
  userId: string,
  body: ChangeRoleInput,
): Promise<AdminUser> {
  return apiRequest(`/admin/users/${userId}/role`, {
    method: "POST",
    body,
    schema: adminUserSchema,
  });
}

/* --------------------------------------------------------------- realtime */

export function mintWsTicket(): Promise<WsTicket> {
  return apiRequest("/ws/ticket", {
    method: "POST",
    body: {},
    schema: wsTicketSchema,
  });
}
