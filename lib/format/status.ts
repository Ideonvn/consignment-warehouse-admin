/**
 * One place that maps every auction and lot status to a label and a tone.
 * StatusBadge is the only consumer; nothing else invents its own colours.
 */
import type {
  AuctionStatus,
  InvoiceStatus,
  LotProgress,
  LotStatus,
  UserRole,
  UserStatus,
} from "@/types/api";

export type Tone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "accent";

export interface StatusMeta {
  label: string;
  tone: Tone;
  /** Live things get a subtle pulse so the eye finds them. */
  pulse?: boolean;
  /** Shown as a title/tooltip where space allows. */
  hint?: string;
}

export const AUCTION_STATUS_META: Record<AuctionStatus, StatusMeta> = {
  draft: { label: "Draft", tone: "neutral", hint: "Not visible to bidders yet" },
  scheduled: {
    label: "Scheduled",
    tone: "info",
    hint: "Published and waiting to open",
  },
  live: { label: "Live", tone: "success", pulse: true, hint: "Bidding is open" },
  ended: { label: "Ended", tone: "neutral", hint: "Bidding has closed" },
  settled: { label: "Settled", tone: "neutral", hint: "Closed and reconciled" },
  cancelled: {
    label: "Cancelled",
    tone: "danger",
    hint: "Cancelled; bidders were notified",
  },
};

export const LOT_STATUS_META: Record<LotStatus, StatusMeta> = {
  draft: { label: "Draft", tone: "neutral", hint: "Not published" },
  scheduled: { label: "Scheduled", tone: "info", hint: "Waiting to open" },
  live: { label: "Live", tone: "success", pulse: true, hint: "Bidding is open" },
  ended_sold: { label: "Sold", tone: "success", hint: "Closed with a winner" },
  ended_unsold: {
    label: "Unsold",
    tone: "neutral",
    hint: "Closed with no bids",
  },
  ended_reserve_not_met: {
    label: "Reserve not met",
    tone: "warning",
    hint: "Needs a decision: accept the top bid or relist",
  },
  withdrawn: {
    label: "Withdrawn",
    tone: "danger",
    hint: "Pulled from the auction; bid history stands",
  },
  cancelled: { label: "Cancelled", tone: "danger", hint: "Cancelled" },
};

export const USER_STATUS_META: Record<UserStatus, StatusMeta> = {
  active: { label: "Active", tone: "success" },
  suspended: {
    label: "Suspended",
    tone: "danger",
    hint: "Cannot log in; existing bids still stand",
  },
  deleted: { label: "Deleted", tone: "neutral" },
};

export const USER_ROLE_META: Record<UserRole, StatusMeta> = {
  bidder: { label: "Bidder", tone: "neutral" },
  admin: { label: "Admin", tone: "info" },
  superadmin: { label: "Superadmin", tone: "accent" },
};

/**
 * The second status axis: what will move this lot next.
 *
 * `quiet` means the lot status badge beside it already says this — a `live` lot
 * reading "Live · Live" is noise. The three loud ones are exactly the three a
 * bidder cannot see, which is what an operator scanning a list needs to spot.
 */
export const LOT_PROGRESS_META: Record<LotProgress, StatusMeta & { quiet?: boolean }> = {
  live: { label: "Live", tone: "success", quiet: true },
  waiting_for_worker: { label: "Opens on its own", tone: "info", quiet: true },
  waiting_for_auction_publish: {
    label: "Publish the auction",
    tone: "neutral",
    hint: "A draft lot in a draft auction. Publishing the auction takes it along — there is nothing to do on the lot itself.",
  },
  needs_publish: {
    label: "Needs publishing",
    tone: "warning",
    hint: "The auction is already out, so this lot was left behind as a draft. Bidders cannot see it until you publish it.",
  },
  abandoned: {
    label: "Missed the auction",
    tone: "danger",
    hint: "A draft lot in an auction that has finished. It can never open — relist it in another auction.",
  },
  terminal: { label: "Finished", tone: "neutral", quiet: true },
};

export const BID_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  outbid: "Outbid",
  won: "Won",
  void: "Void",
};

/** Statuses that keep a lot's clock running. */
export const OPEN_LOT_STATUSES: LotStatus[] = ["scheduled", "live"];

export function isLotDecisionPending(status: LotStatus): boolean {
  return status === "ended_reserve_not_met";
}

/**
 * Invoice status, which is **derived server-side and never stored** —
 * `invoicing.status_of` computes it from the allocations and the clock on every
 * read, in one precedence order: paid > overdue > part_paid > unpaid.
 *
 * ⚠️ Never re-derive it in a component. The `?unpaid=` filter on the list is
 * applied to the same derivation, so a screen that computed its own would
 * eventually disagree with the rows it was handed.
 *
 * `paid` is `success` and `overdue` is `warning` rather than `danger`: an
 * overdue invoice is a thing to chase, not a failure, and `danger` is reserved
 * here for cancelled and suspended.
 */
export const INVOICE_STATUS_META: Record<InvoiceStatus, StatusMeta> = {
  unpaid: {
    label: "Unpaid",
    tone: "neutral",
    hint: "Nothing allocated to it yet, and not yet due",
  },
  part_paid: {
    label: "Part paid",
    tone: "info",
    hint: "Some of a payment has been allocated, but not the full amount",
  },
  paid: {
    label: "Paid",
    tone: "success",
    hint: "Settled in full — paid wins over overdue, so a late settlement is still settled",
  },
  overdue: {
    label: "Overdue",
    tone: "warning",
    hint: "Past its due date with money still on it",
  },
};
