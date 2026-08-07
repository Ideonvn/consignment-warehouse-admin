/**
 * One place that maps every auction and lot status to a label and a tone.
 * StatusBadge is the only consumer; nothing else invents its own colours.
 */
import type { AuctionStatus, LotStatus, UserRole, UserStatus } from "@/types/api";

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
