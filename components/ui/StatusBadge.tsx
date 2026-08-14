"use client";

import {
  AUCTION_STATUS_META,
  LOT_PROGRESS_META,
  LOT_STATUS_META,
  USER_ROLE_META,
  USER_STATUS_META,
  type StatusMeta,
  type Tone,
} from "@/lib/format/status";
import type {
  AuctionStatus,
  LotProgress,
  LotStatus,
  UserRole,
  UserStatus,
} from "@/types/api";
import { cn } from "@/lib/utils";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-text-muted border-border-strong",
  info: "bg-info-tint text-accent-strong border-info-tint-border",
  success: "bg-success-tint text-success-ink border-success-tint-border",
  warning: "bg-warning-tint text-warning-ink border-warning-tint-border",
  danger: "bg-danger-tint text-danger-ink border-danger-tint-border",
  accent: "bg-accent text-accent-ink border-accent",
};

const DOTS: Record<Tone, string> = {
  neutral: "bg-text-muted",
  info: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  accent: "bg-accent-ink",
};

function Badge({ meta, className }: { meta: StatusMeta; className?: string }) {
  return (
    <span
      title={meta.hint}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[meta.tone],
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          DOTS[meta.tone],
          meta.pulse && "pulse-live",
        )}
      />
      {meta.label}
    </span>
  );
}

export function StatusBadge({
  status,
  kind,
  className,
}: {
  status: AuctionStatus | LotStatus | UserStatus;
  kind: "auction" | "lot" | "user";
  className?: string;
}) {
  const meta =
    kind === "auction"
      ? AUCTION_STATUS_META[status as AuctionStatus]
      : kind === "lot"
        ? LOT_STATUS_META[status as LotStatus]
        : USER_STATUS_META[status as UserStatus];
  if (!meta) return <span className="text-text-muted">{status}</span>;
  return <Badge meta={meta} className={className} />;
}

/**
 * The lot's second status axis, from the same map and the same colours as every
 * other badge — two colour languages on one row would be worse than none.
 *
 * Renders nothing when the progress only repeats what the lot status badge next
 * to it already says. What is left is exactly the set a bidder cannot see, so a
 * badge here always means "this one is not on the market".
 */
export function LotProgressBadge({
  progress,
  className,
}: {
  progress: LotProgress;
  className?: string;
}) {
  const meta = LOT_PROGRESS_META[progress];
  if (!meta || meta.quiet) return null;
  return <Badge meta={meta} className={className} />;
}

export function RoleBadge({
  role,
  className,
}: {
  role: UserRole;
  className?: string;
}) {
  const meta = USER_ROLE_META[role];
  if (!meta) return <span className="text-text-muted">{role}</span>;
  return <Badge meta={meta} className={className} />;
}
