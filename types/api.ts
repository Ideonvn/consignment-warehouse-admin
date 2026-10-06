/**
 * Every shape the Consignment Warehouse backend returns or accepts, as zod
 * schemas with inferred TypeScript types.
 *
 * Conventions baked in here:
 *  - `*_minor` fields are integer cents. Never floats. See lib/format/money.ts.
 *  - Timestamps are ISO 8601 UTC strings; they stay strings until render time.
 *    They are typed `z.string()` rather than a strict datetime so a harmless
 *    precision change on the backend cannot brick a screen.
 *  - Object schemas are intentionally non-strict: unknown extra fields pass
 *    through, so the portal survives additive backend changes.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ enums */

export const userRoleSchema = z.enum(["bidder", "admin", "superadmin"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userStatusSchema = z.enum(["active", "suspended", "deleted"]);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const auctionStatusSchema = z.enum([
  "draft",
  "scheduled",
  "live",
  "ended",
  "settled",
  "cancelled",
]);
export type AuctionStatus = z.infer<typeof auctionStatusSchema>;

export const lotStatusSchema = z.enum([
  "draft",
  "scheduled",
  "live",
  "ended_sold",
  "ended_unsold",
  "ended_reserve_not_met",
  "withdrawn",
  "cancelled",
]);
export type LotStatus = z.infer<typeof lotStatusSchema>;

export const bidStatusSchema = z.enum(["active", "outbid", "won", "void"]);
export type BidStatus = z.infer<typeof bidStatusSchema>;

/* ------------------------------------------------------------------- auth */

export const tokenPairSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().nullish(),
  token_type: z.string(),
  expires_in: z.number(),
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

export const meSchema = z.object({
  id: z.string(),
  phone_e164: z.string(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  email: z.string().nullable(),
  status: userStatusSchema,
  role: userRoleSchema,
  is_phone_verified: z.boolean(),
  last_login_at: z.string().nullable(),
  created_at: z.string(),
});
export type Me = z.infer<typeof meSchema>;

export const otpRequestSchema = z.object({ phone: z.string() });
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  phone: z.string(),
  code: z.string(),
  device_id: z.string(),
  device_name: z.string().optional(),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

export const updateMeSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().optional(),
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

/* --------------------------------------------------------------- auctions */

/**
 * Who may see an auction at all — orthogonal to `auctionStatusSchema`.
 *
 * Status is where an auction is in its lifecycle; visibility is whether an
 * anonymous visitor can reach it. A `live` auction may be either. **Lots
 * inherit this from their auction and there is no per-lot flag**, deliberately:
 * a second axis would make "can this be seen" the product of two settings.
 *
 * Not a status, so it deliberately does not go through `StatusBadge`.
 */
export const auctionVisibilitySchema = z.enum(["public", "private"]);
export type AuctionVisibility = z.infer<typeof auctionVisibilitySchema>;

export const auctionAdminSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  image_url: z.string().nullable(),
  status: auctionStatusSchema,
  starts_at: z.string(),
  ends_at: z.string(),
  currency_code: z.string(),
  anti_snipe_window_seconds: z.number(),
  anti_snipe_extension_seconds: z.number(),
  max_extensions: z.number(),
  created_by_user_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  lot_count: z.number(),
  /**
   * Set only when the image was uploaded here rather than pointed at.
   * Admin-only, and its value is never rendered — it exists so the UI can tell
   * an uploaded image from an external URL.
   */
  image_storage_key: z.string().nullable(),
  /** What a bidder must hold in credit before this auction lets them bid. */
  deposit_amount_minor: z.number(),
  /** Basis points: 1500 is 15%. Never shown raw to the operator. */
  commission_bps: z.number(),
  /** Public means anyone can browse it without an account. Defaults to public. */
  visibility: auctionVisibilitySchema,
});
export type AuctionAdmin = z.infer<typeof auctionAdminSchema>;

/** Which of the three image states an auction is in. */
export type AuctionImageState = "none" | "external" | "uploaded";

export function auctionImageState(auction: {
  image_url: string | null;
  image_storage_key: string | null;
}): AuctionImageState {
  if (!auction.image_url) return "none";
  return auction.image_storage_key ? "uploaded" : "external";
}

/** The backend accepts only http(s) for image_url; anything else is a 422. */
export const IMAGE_URL_RE = /^https?:\/\/\S+$/i;

/** PATCH / cancel responses carry the blast radius alongside the auction. */
export const auctionMutationSchema = auctionAdminSchema.extend({
  lots_rescheduled: z.number().nullish(),
  lots_cancelled: z.number().nullish(),
});
export type AuctionMutation = z.infer<typeof auctionMutationSchema>;

export const AUCTION_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export const createAuctionSchema = z.object({
  slug: z.string().regex(AUCTION_SLUG_RE),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  starts_at: z.string(),
  ends_at: z.string(),
  currency_code: z.string().optional(),
  anti_snipe_window_seconds: z.number().int().min(0).optional(),
  anti_snipe_extension_seconds: z.number().int().min(0).optional(),
  max_extensions: z.number().int().min(0).optional(),
  deposit_amount_minor: z.number().int().min(0).optional(),
  commission_bps: z.number().int().min(0).max(10000).optional(),
  /** Ordinary field on the create payload — no two-phase dance like the image. */
  visibility: auctionVisibilitySchema.optional(),
});
export type CreateAuctionInput = z.infer<typeof createAuctionSchema>;

export const updateAuctionSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  currency_code: z.string().optional(),
  anti_snipe_window_seconds: z.number().int().optional(),
  anti_snipe_extension_seconds: z.number().int().optional(),
  max_extensions: z.number().int().optional(),
  deposit_amount_minor: z.number().int().min(0).optional(),
  commission_bps: z.number().int().min(0).max(10000).optional(),
  /** Never frozen: changeable at any time, including mid-auction. */
  visibility: auctionVisibilitySchema.optional(),
  confirm_shorten: z.boolean().optional(),
});
export type UpdateAuctionInput = z.infer<typeof updateAuctionSchema>;

export const cancelAuctionSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type CancelAuctionInput = z.infer<typeof cancelAuctionSchema>;

/* -------------------------------------------------------- increment rules */

export const incrementRuleSchema = z.object({
  id: z.string(),
  /** null means this is a global rule, inherited when an auction has none. */
  auction_id: z.string().nullable(),
  min_price_minor: z.number(),
  increment_minor: z.number(),
});
export type IncrementRule = z.infer<typeof incrementRuleSchema>;

export const createIncrementRuleSchema = z.object({
  min_price_minor: z.number().int().min(0),
  increment_minor: z.number().int().positive(),
});
export type CreateIncrementRuleInput = z.infer<typeof createIncrementRuleSchema>;

/* ------------------------------------------------------------------- lots */

/**
 * What will move this lot next — a second axis alongside its status, and the
 * only thing that distinguishes the three quite different reasons a lot can be
 * sitting in `draft`. Total over (auction status × lot status), so there is no
 * "other" case to guess at.
 */
export const lotProgressSchema = z.enum([
  "live",
  "waiting_for_worker",
  "waiting_for_auction_publish",
  "needs_publish",
  "abandoned",
  "terminal",
]);
export type LotProgress = z.infer<typeof lotProgressSchema>;

export const lotAdminSummarySchema = z.object({
  id: z.string(),
  auction_id: z.string(),
  lot_number: z.number().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: lotStatusSchema,
  starting_price_minor: z.number(),
  bid_increment_minor: z.number().nullable(),
  reserve_price_minor: z.number().nullable(),
  scheduled_ends_at: z.string().nullable(),
  effective_ends_at: z.string().nullable(),
  extension_count: z.number(),
  current_bid_minor: z.number().nullable(),
  current_leader_user_id: z.string().nullable(),
  bid_count: z.number(),
  bid_sequence: z.number(),
  relisted_from_lot_id: z.string().nullable(),
  primary_image_url: z.string().nullable(),
  current_leader_handle: z.string().nullable(),
  progress: lotProgressSchema,
  /** Derived from `progress`, so a screen never re-derives the state machine. */
  is_visible_to_bidders: z.boolean(),
});
export type LotAdminSummary = z.infer<typeof lotAdminSummarySchema>;

export const lotImageSchema = z.object({
  id: z.string(),
  url: z.string(),
  position: z.number(),
  is_primary: z.boolean(),
  width: z.number().nullable(),
  height: z.number().nullable(),
});
export type LotImage = z.infer<typeof lotImageSchema>;

export const lotImageAdminSchema = lotImageSchema.extend({
  lot_id: z.string(),
  storage_key: z.string(),
});
export type LotImageAdmin = z.infer<typeof lotImageAdminSchema>;

/** GET /admin/lots/{id} — the only endpoint that exposes a reserve. */
export const lotAdminDetailSchema = z.object({
  id: z.string(),
  auction_id: z.string(),
  lot_number: z.number().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: lotStatusSchema,
  starting_price_minor: z.number(),
  bid_increment_minor: z.number().nullish(),
  current_bid_minor: z.number().nullable(),
  minimum_next_bid_minor: z.number().nullish(),
  bid_count: z.number(),
  bid_sequence: z.number(),
  scheduled_ends_at: z.string().nullable(),
  effective_ends_at: z.string().nullable(),
  extension_count: z.number(),
  reserve_met: z.boolean().nullish(),
  primary_image_url: z.string().nullish(),
  images: z.array(lotImageSchema).default([]),
  my_auto_bid_max_minor: z.number().nullish(),
  am_i_leading: z.boolean().nullish(),
  reserve_price_minor: z.number().nullable(),
  current_leader_user_id: z.string().nullable(),
  current_leader_handle: z.string().nullable(),
  relisted_from_lot_id: z.string().nullable(),
  progress: lotProgressSchema,
  is_visible_to_bidders: z.boolean(),
  /**
   * The photo cap, as a pair. `image_count` duplicates `images.length`, but the
   * LIMIT is not derivable from anything the client holds — without it the
   * portal can only discover the cap by being refused, which is an error where
   * a counter would do. Defaulted so an older backend degrades to "no cap
   * known" rather than failing the parse.
   */
  image_count: z.number().default(0),
  image_limit: z.number().default(0),
});
export type LotAdminDetail = z.infer<typeof lotAdminDetailSchema>;

export const createLotSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  starting_price_minor: z.number().int().min(0),
  bid_increment_minor: z.number().int().positive().nullable().optional(),
  reserve_price_minor: z.number().int().min(0).nullable().optional(),
  lot_number: z.number().int().positive().nullable().optional(),
});
export type CreateLotInput = z.infer<typeof createLotSchema>;

export const updateLotSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  starting_price_minor: z.number().int().optional(),
  bid_increment_minor: z.number().int().nullable().optional(),
  reserve_price_minor: z.number().int().nullable().optional(),
  scheduled_ends_at: z.string().optional(),
  effective_ends_at: z.string().optional(),
  status: lotStatusSchema.optional(),
});
export type UpdateLotInput = z.infer<typeof updateLotSchema>;

export const reasonSchema = z.object({ reason: z.string().min(1).max(500) });
export type ReasonInput = z.infer<typeof reasonSchema>;

export const relistLotSchema = z.object({
  target_auction_id: z.string(),
  lot_number: z.number().int().positive().nullable().optional(),
});
export type RelistLotInput = z.infer<typeof relistLotSchema>;

/* ------------------------------------------------------------------- bids */

export const bidSchema = z.object({
  id: z.string(),
  sequence: z.number(),
  amount_minor: z.number(),
  status: bidStatusSchema,
  is_auto: z.boolean(),
  created_at: z.string(),
  bidder_handle: z.string().nullable(),
  is_mine: z.boolean(),
});
export type Bid = z.infer<typeof bidSchema>;

export const voidBidResultSchema = z.object({
  bid_id: z.string(),
  lot_id: z.string(),
  status: bidStatusSchema,
  current_bid_minor: z.number().nullable(),
  current_leader_user_id: z.string().nullable(),
  bid_count: z.number(),
});
export type VoidBidResult = z.infer<typeof voidBidResultSchema>;

/* ----------------------------------------------------------------- images */

export const presignRequestSchema = z.object({
  content_type: z.string(),
  size_bytes: z.number().int().positive(),
});
export type PresignRequestInput = z.infer<typeof presignRequestSchema>;

export const presignResultSchema = z.object({
  url: z.string(),
  fields: z.record(z.string(), z.string()),
  storage_key: z.string(),
  max_bytes: z.number(),
  expires_in: z.number(),
});
export type PresignResult = z.infer<typeof presignResultSchema>;

export const confirmAuctionImageSchema = z.object({
  storage_key: z.string(),
});
export type ConfirmAuctionImageInput = z.infer<
  typeof confirmAuctionImageSchema
>;

export const confirmImageSchema = z.object({
  storage_key: z.string(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  is_primary: z.boolean().optional(),
  position: z.number().int().nullable().optional(),
});
export type ConfirmImageInput = z.infer<typeof confirmImageSchema>;

export const updateImageSchema = z.object({
  position: z.number().int().optional(),
  is_primary: z.boolean().optional(),
});
export type UpdateImageInput = z.infer<typeof updateImageSchema>;

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
/** The API rejects larger; the storage policy enforces it again on upload. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/* --------------------------------------------------- structured errors */

/** 409 on a frozen field: the API names the input that cannot change. */
export const frozenFieldErrorSchema = z.object({
  detail: z.object({
    message: z.string(),
    field: z.string(),
  }),
});
export type FrozenFieldError = z.infer<typeof frozenFieldErrorSchema>;

/** 422 when a bid is under the next valid increment. */
export const bidTooLowErrorSchema = z.object({
  detail: z.object({
    message: z.string(),
    minimum_next_bid_minor: z.number(),
  }),
});
export type BidTooLowError = z.infer<typeof bidTooLowErrorSchema>;

/* ------------------------------------------------------------------ users */

export const adminUserSchema = z.object({
  id: z.string(),
  phone_e164: z.string(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  email: z.string().nullable(),
  /** What the bidder quotes on a bank transfer. Defaulted into every reference field. */
  payment_reference: z.string().nullable(),
  /**
   * Whether email can reach this person. Unverified addresses are never routed
   * to, and a bounced one is failing silently — between them they answer "I
   * never got the notification", which is otherwise unanswerable.
   */
  email_verified_at: z.string().nullable(),
  email_bounced_at: z.string().nullable(),
  status: userStatusSchema,
  role: userRoleSchema,
  is_phone_verified: z.boolean(),
  last_login_at: z.string().nullable(),
  created_at: z.string(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUserDetailSchema = adminUserSchema.extend({
  /**
   * The bidder's ID or passport number, on the DETAIL shape only — the same
   * reason the list carries no address. It names a person, and a table of them
   * is a worse thing to leave on a screen than one record someone opened
   * deliberately. Free text: a passport number is a legitimate answer, so it is
   * neither unique nor checksum-validated anywhere.
   */
  id_number: z.string().nullable(),
  bid_count: z.number(),
  lots_bid_on: z.number(),
  lots_currently_winning: z.number(),
  active_sessions: z.number(),
});
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

export const changeRoleSchema = z.object({
  role: userRoleSchema,
  reason: z.string().min(1).max(500),
});
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;

/* ----------------------------------------------------------------- ledger */

/**
 * One running ledger per user. Signed entries in minor units; the balance is
 * their sum. Positive is in credit, negative is owing. There are no buckets and
 * no transfers — one number per person.
 *
 * `deposit` is RETIRED: security deposits moved to their own book on 2026-10-02
 * (see `depositEntryTypeSchema` below) and the backend refuses a new one. The
 * member stays because rows posted before the split still come back and still
 * have to render.
 */
export const ledgerEntryTypeSchema = z.enum([
  "deposit",
  "payment",
  "lot_won",
  "commission",
  "refund",
  "adjustment",
  "reversal",
]);
export type LedgerEntryType = z.infer<typeof ledgerEntryTypeSchema>;

/** Only `adjustment` has no inherent direction, so only it carries this. */
export const ledgerDirectionSchema = z.enum(["credit", "debit"]);
export type LedgerDirection = z.infer<typeof ledgerDirectionSchema>;

export const ledgerEntryAdminSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  entry_type: ledgerEntryTypeSchema,
  /**
   * SIGNED on the way out — the backend has already applied the direction the
   * entry type implies. On the way in it is a positive magnitude; see
   * `createLedgerEntrySchema`.
   */
  amount_minor: z.number(),
  currency_code: z.string(),
  description: z.string().nullable(),
  reference: z.string().nullable(),
  lot_id: z.string().nullable(),
  auction_id: z.string().nullable(),
  created_by_user_id: z.string().nullable(),
  /** Set on a correction, pointing at the entry it cancels. */
  reverses_entry_id: z.string().nullable(),
  rate_bps: z.number().nullable(),
  created_at: z.string(),
  /** Accumulated oldest-first and continued across pages; null on a POST. */
  balance_after_minor: z.number().nullish(),
});
export type LedgerEntryAdmin = z.infer<typeof ledgerEntryAdminSchema>;

export const ledgerStatementSchema = z.object({
  user_id: z.string(),
  balance_minor: z.number(),
  currency_code: z.string(),
  entries: z.array(ledgerEntryAdminSchema),
});
export type LedgerStatement = z.infer<typeof ledgerStatementSchema>;

/**
 * `amount_minor` is a positive MAGNITUDE. The sign comes from `entry_type`, so
 * a negative amount is not representable and the UI must never offer one.
 */
export const createLedgerEntrySchema = z.object({
  entry_type: ledgerEntryTypeSchema,
  amount_minor: z.number().int().positive(),
  direction: ledgerDirectionSchema.optional(),
  description: z.string().max(2000).nullable().optional(),
  reference: z.string().max(200).nullable().optional(),
  /**
   * Which invoices this payment settles, and by how much. Omitted or empty means
   * on-account credit, which is ordinary rather than an incomplete request.
   *
   * A LIST, because one bank transfer legitimately settles two invoices. Only a
   * `payment` may carry these — the backend refuses them on any other type, so
   * the UI must not offer the control for one. Over-allocating is refused in
   * both directions (more than the payment, or more than the invoice still
   * owes) and takes the payment down with it: nothing is clamped.
   */
  allocations: z
    .array(
      z.object({
        invoice_id: z.string(),
        amount_minor: z.number().int().positive(),
      }),
    )
    .optional(),
});
export type CreateLedgerEntryInput = z.infer<typeof createLedgerEntrySchema>;

/* ----------------------------------------------------------- deposit book */

/**
 * The security-deposit book — a SECOND ledger, not a slice of the first.
 *
 * What the bid gate reads is `held_minor` here, never the account balance.
 * Winning a lot charges the trading ledger and cannot move this number, which is
 * the whole reason the backend split the two tables. Keep these types separate
 * from the ledger ones for the same reason: one shared shape and a deposit can
 * be rendered as something that offsets what is owed.
 */
export const depositEntryTypeSchema = z.enum(["paid", "refunded", "reversal"]);
export type DepositEntryType = z.infer<typeof depositEntryTypeSchema>;

export const depositEntryAdminSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  entry_type: depositEntryTypeSchema,
  /** SIGNED on the way out; a positive MAGNITUDE on the way in. */
  amount_minor: z.number(),
  currency_code: z.string(),
  description: z.string().nullable(),
  reference: z.string().nullable(),
  created_by_user_id: z.string().nullable(),
  /** Set on a correction, pointing at the entry it cancels. */
  reverses_entry_id: z.string().nullable(),
  created_at: z.string(),
  /** Accumulated oldest-first and continued across pages; null on a POST. */
  held_after_minor: z.number().nullish(),
});
export type DepositEntryAdmin = z.infer<typeof depositEntryAdminSchema>;

export const depositStatementSchema = z.object({
  user_id: z.string(),
  /** What we hold. Never negative in practice, and never reduced by a win. */
  held_minor: z.number(),
  currency_code: z.string(),
  entries: z.array(depositEntryAdminSchema),
});
export type DepositStatement = z.infer<typeof depositStatementSchema>;

/**
 * `amount_minor` is a positive MAGNITUDE; the sign comes from `entry_type`.
 * There is no direction field — neither `paid` nor `refunded` is ambiguous — and
 * `reversal` is posted through its own route, so it is not offerable here.
 */
export const createDepositEntrySchema = z.object({
  entry_type: z.enum(["paid", "refunded"]),
  amount_minor: z.number().int().positive(),
  description: z.string().max(2000).nullable().optional(),
  reference: z.string().max(200).nullable().optional(),
});
export type CreateDepositEntryInput = z.infer<typeof createDepositEntrySchema>;

/* ---------------------------------------------------------------- invoices */

/**
 * **Derived, never stored.** The backend has no `status` column on `invoices` —
 * `invoicing.status_of` computes this from the allocations and the clock on every
 * read, so the list, the detail and the `unpaid` filter cannot disagree.
 *
 * Precedence, which the UI must not re-derive: paid > overdue > part_paid > unpaid.
 * An invoice settled late is **settled**; showing it as overdue forever puts it on
 * a chasing list nobody can clear.
 */
export const invoiceStatusSchema = z.enum([
  "unpaid",
  "part_paid",
  "paid",
  "overdue",
]);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

/**
 * One printed line, frozen at issue.
 *
 * Amounts are **positive magnitudes**. The same charges are negative on the
 * ledger because they reduce a balance; on a document they are amounts owed, and
 * a minus sign there reads as a credit.
 */
export const invoiceLineAdminSchema = z.object({
  position: z.number(),
  description: z.string(),
  lot_id: z.string().nullable(),
  net_minor: z.number(),
  tax_minor: z.number(),
  gross_minor: z.number(),
  tax_rate_bps: z.number(),
});
export type InvoiceLineAdmin = z.infer<typeof invoiceLineAdminSchema>;

/** How much of one payment settled this invoice. */
export const invoiceAllocationSchema = z.object({
  invoice_id: z.string(),
  invoice_number: z.string(),
  amount_minor: z.number(),
});
export type InvoiceAllocation = z.infer<typeof invoiceAllocationSchema>;

/**
 * An issued invoice. **Immutable** — there is no edit, no delete and no
 * regenerate route, and the UI must not offer one. A mistake is corrected by
 * reversing the charge, and the next invoice bills what is actually owed.
 *
 * `vat_number` and `tax_rate_bps` are SNAPSHOTS taken at issue, not the current
 * settings: a VAT number that appeared on a document cannot be unprinted by
 * editing configuration. Render these, never anything from a settings endpoint.
 */
export const invoiceAdminSchema = z.object({
  id: z.string(),
  number: z.string(),
  user_id: z.string(),
  auction_id: z.string(),
  issued_at: z.string(),
  due_at: z.string(),
  currency_code: z.string(),
  subtotal_minor: z.number(),
  tax_minor: z.number(),
  total_minor: z.number(),
  /** Empty means we were not a registered vendor at issue — "Invoice", not "Tax Invoice". */
  vat_number: z.string(),
  tax_rate_bps: z.number(),
  bill_to_name: z.string().nullable(),
  bill_to_reference: z.string().nullable(),
  /** Summed from the allocations, excluding any whose payment has been reversed. */
  paid_minor: z.number(),
  status: invoiceStatusSchema,
});
export type InvoiceAdmin = z.infer<typeof invoiceAdminSchema>;
export const invoiceAdminListSchema = z.array(invoiceAdminSchema);

export const invoiceAdminDetailSchema = invoiceAdminSchema.extend({
  /**
   * What the DOCUMENT prints in its customer block, snapshotted at issue — not
   * what the user record says today. An operator fielding "this invoice has my
   * old number on it" needs the frozen value; the live one is a click away on
   * the user page.
   */
  bill_to_first_name: z.string().nullable(),
  bill_to_last_name: z.string().nullable(),
  bill_to_id_number: z.string().nullable(),
  bill_to_phone: z.string().nullable(),
  lines: z.array(invoiceLineAdminSchema),
  /** Why it reads as paid — without these the only check is reconciling by eye. */
  allocations: z.array(invoiceAllocationSchema),
});
export type InvoiceAdminDetail = z.infer<typeof invoiceAdminDetailSchema>;

/* ----------------------------------------------------------- participants */

/** Computed on read — there is no participant table and no approval step. */
export const participantSchema = z.object({
  user_id: z.string(),
  handle: z.string(),
  phone_e164: z.string(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  /** The TRADING account: what they owe or are owed for lots. Not what admits them. */
  balance_minor: z.number(),
  /** The security deposit we hold. This is the number the bid gate compares. */
  deposit_held_minor: z.number(),
  required_deposit_minor: z.number(),
  /** `required - deposit_held`, floored at zero by the backend. */
  shortfall_minor: z.number(),
  /** Held deposit covers the requirement, OR `admitted_by_bid` — the gate's rule exactly. */
  is_eligible: z.boolean(),
  /**
   * Has bid in this auction at all, voided bids included. Admission is earned
   * once and not revoked, so this can be true alongside a non-zero shortfall.
   */
  admitted_by_bid: z.boolean(),
  /** Non-void bids only: bidding activity, not admission. */
  has_bid: z.boolean(),
  bid_count: z.number(),
});
export type Participant = z.infer<typeof participantSchema>;

/**
 * One debtor on the outstanding list, computed from the ledger the same way the
 * participants list is — there is no debtors table to drift.
 *
 * `balance_minor` is signed and `amount_owing_minor` is the same figure as a
 * positive magnitude. Render the magnitude: negating a balance in a component is
 * how a credit ends up displayed as a debt.
 */
export const outstandingSchema = z.object({
  user_id: z.string(),
  handle: z.string(),
  phone_e164: z.string(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  payment_reference: z.string().nullable(),
  balance_minor: z.number(),
  amount_owing_minor: z.number(),
  currency_code: z.string(),
  last_entry_at: z.string(),
});
export type Outstanding = z.infer<typeof outstandingSchema>;
export const outstandingListSchema = z.array(outstandingSchema);

/* --------------------------------------------------------------- realtime */

export const wsTicketSchema = z.object({
  ticket: z.string(),
  expires_in: z.number(),
});
export type WsTicket = z.infer<typeof wsTicketSchema>;

export const wsBidEventSchema = z.object({
  type: z.literal("bid"),
  lot_id: z.string(),
  sequence: z.number(),
  amount_minor: z.number(),
  bidder_handle: z.string().nullable(),
  bid_count: z.number(),
  is_auto: z.boolean(),
  created_at: z.string(),
});
export type WsBidEvent = z.infer<typeof wsBidEventSchema>;

export const wsLotExtendedSchema = z.object({
  type: z.literal("lot_extended"),
  lot_id: z.string(),
  effective_ends_at: z.string(),
  extension_count: z.number().nullish(),
  sequence: z.number().nullish(),
});
export type WsLotExtendedEvent = z.infer<typeof wsLotExtendedSchema>;

export const wsLotRescheduledSchema = z.object({
  type: z.literal("lot_rescheduled"),
  lot_id: z.string(),
  effective_ends_at: z.string().nullish(),
  scheduled_ends_at: z.string().nullish(),
});
export type WsLotRescheduledEvent = z.infer<typeof wsLotRescheduledSchema>;

export const wsLotClosedSchema = z.object({
  type: z.literal("lot_closed"),
  lot_id: z.string(),
  status: lotStatusSchema.nullish(),
  current_bid_minor: z.number().nullish(),
});
export type WsLotClosedEvent = z.infer<typeof wsLotClosedSchema>;

export const wsLotOpenedSchema = z.object({
  type: z.literal("lot_opened"),
  lot_id: z.string(),
});
export type WsLotOpenedEvent = z.infer<typeof wsLotOpenedSchema>;

export const wsSubscribedSchema = z.object({
  type: z.enum(["subscribed", "unsubscribed"]),
  lot_ids: z.array(z.string()).nullish(),
});

export const wsResyncCompleteSchema = z.object({
  type: z.literal("resync_complete"),
  lot_id: z.string().nullish(),
});

export const wsResyncTooFarSchema = z.object({
  type: z.literal("resync_too_far"),
  lot_id: z.string().nullish(),
});

export const wsErrorSchema = z.object({
  type: z.literal("error"),
  code: z.string().nullish(),
  message: z.string().nullish(),
  detail: z.string().nullish(),
});

export const wsServerMessageSchema = z.discriminatedUnion("type", [
  wsBidEventSchema,
  wsLotExtendedSchema,
  wsLotRescheduledSchema,
  wsLotClosedSchema,
  wsLotOpenedSchema,
  wsSubscribedSchema.extend({ type: z.literal("subscribed") }),
  wsSubscribedSchema.extend({ type: z.literal("unsubscribed") }),
  wsResyncCompleteSchema,
  wsResyncTooFarSchema,
  wsErrorSchema,
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("pong") }),
]);
export type WsServerMessage = z.infer<typeof wsServerMessageSchema>;

export type WsClientMessage =
  | {
      action: "subscribe";
      lot_ids: string[];
      /** Per-lot resume points. Sequences are per lot, so this map is the
       *  correct form; a single scalar is wrong for all but one of a batch. */
      after_sequences?: Record<string, number>;
    }
  | { action: "unsubscribe"; lot_ids: string[] }
  | { action: "resync"; lot_id: string; after_sequence: number }
  | { action: "ping" }
  | { action: "pong" };

/* ------------------------------------------------------------ list params */

export interface OffsetPage {
  limit?: number;
  offset?: number;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
