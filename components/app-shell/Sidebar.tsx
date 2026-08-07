"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDecisionCount } from "@/lib/api/queries";
import { useAuctionContextStore } from "@/lib/ui/auction-context";
import { cn } from "@/lib/utils";
import {
  AuctionIcon,
  DecisionIcon,
  LotIcon,
  MonitorIcon,
  UsersIcon,
} from "./icons";

interface NavItem {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
  match: (pathname: string) => boolean;
  disabledReason?: string;
  badge?: number;
}

export function Sidebar({
  onNavigate,
  variant = "rail",
}: {
  onNavigate?: () => void;
  /** "rail" collapses to icons under 1280px; "drawer" is always full width. */
  variant?: "rail" | "drawer";
}) {
  const pathname = usePathname();
  const decisions = useDecisionCount();
  const auction = useAuctionContextStore((s) => s.auction);

  const items: NavItem[] = [
    {
      href: "/auctions",
      label: "Auctions",
      icon: AuctionIcon,
      match: (p) => p === "/auctions" || p.startsWith("/auctions/"),
    },
    {
      href: auction ? `/auctions/${auction.id}?tab=lots` : "/auctions",
      label: "Lots",
      icon: LotIcon,
      match: (p) => p.startsWith("/lots/"),
      disabledReason: auction
        ? undefined
        : "Open an auction to see its lots",
    },
    {
      href: auction ? `/auctions/${auction.id}/monitor` : "/auctions",
      label: "Monitor",
      icon: MonitorIcon,
      match: (p) => p.endsWith("/monitor"),
      disabledReason: auction ? undefined : "Open an auction to watch it live",
    },
    {
      href: "/decisions",
      label: "Decisions",
      icon: DecisionIcon,
      match: (p) => p.startsWith("/decisions"),
      badge: decisions,
    },
    {
      href: "/users",
      label: "Users",
      icon: UsersIcon,
      match: (p) => p.startsWith("/users"),
    },
  ];

  const expanded = variant === "drawer";

  return (
    <nav
      aria-label="Main"
      className={cn(
        "flex h-full flex-col gap-1 border-r border-border bg-surface py-2",
        expanded ? "w-56 px-2" : "w-14 px-2 xl:w-56",
      )}
    >
      {items.map((item) => {
        const active = item.match(pathname);
        const disabled = Boolean(item.disabledReason);
        const content = (
          <>
            <item.icon className="h-4 w-4 shrink-0" />
            <span className={cn("truncate", expanded ? "" : "hidden xl:inline")}>
              {item.label}
            </span>
            {item.badge ? (
              <span
                className={cn(
                  "tnum ml-auto rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-semibold text-white",
                  expanded ? "" : "hidden xl:inline-block",
                )}
                aria-label={`${item.badge} awaiting a decision`}
              >
                {item.badge}
              </span>
            ) : null}
          </>
        );

        if (disabled) {
          return (
            <span
              key={item.label}
              title={item.disabledReason}
              aria-disabled
              className="flex items-center gap-2.5 rounded px-2.5 py-1.5 text-sm text-text-muted opacity-60"
            >
              {content}
            </span>
          );
        }

        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={onNavigate}
            title={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded px-2.5 py-1.5 text-sm",
              active
                ? "bg-[#eff6ff] font-semibold text-accent-strong"
                : "text-text hover:bg-surface-sunken",
            )}
          >
            {content}
          </Link>
        );
      })}

      {auction && (
        <div
          className={cn(
            "mt-auto border-t border-border px-2.5 pt-2",
            expanded ? "" : "hidden xl:block",
          )}
        >
          <p className="text-[10px] font-semibold tracking-wider text-text-muted uppercase">
            Working in
          </p>
          <p className="truncate text-xs font-medium" title={auction.name}>
            {auction.name}
          </p>
        </div>
      )}
    </nav>
  );
}
