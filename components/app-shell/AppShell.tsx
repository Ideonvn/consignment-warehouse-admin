"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { signOut, useSessionStore } from "@/lib/auth";
import { useAuctionContextStore } from "@/lib/ui/auction-context";
import { usePaletteStore } from "@/lib/ui/palette";
import { CommandPalette } from "@/components/CommandPalette";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { StatusBanners } from "./StatusBanners";
import { ThemeToggle } from "./ThemeToggle";
import { MenuIcon } from "./icons";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const user = useSessionStore((s) => s.user);
  const auction = useAuctionContextStore((s) => s.auction);
  const openPalette = usePaletteStore((s) => s.setOpen);

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <StatusBanners />
      <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
        <button
          type="button"
          className="rounded p-1 text-text-muted hover:bg-surface-sunken md:hidden"
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <MenuIcon />
        </button>

        {/* min-w-0 + truncate: the right-hand controls are fixed width, so the
            brand is what has to give on a narrow phone. Without this the header
            overflows and the whole page gets a horizontal scrollbar. */}
        <Link href="/auctions" className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-semibold">
            Consignment Warehouse
          </span>
          <span className="hidden text-[10px] font-semibold tracking-widest text-text-muted uppercase sm:inline">
            Admin
          </span>
        </Link>

        {/* Duplicated by the page heading, so it yields on small screens. */}
        {auction && (
          <div className="ml-2 hidden min-w-0 items-center gap-2 border-l border-border pl-3 md:flex">
            <Link
              href={`/auctions/${auction.id}`}
              className="truncate text-sm font-medium hover:underline"
              title={auction.name}
            >
              {auction.name}
            </Link>
            <StatusBadge status={auction.status} kind="auction" />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => openPalette(true)}
            className="hidden items-center gap-1 rounded border border-border px-2 py-1 text-xs text-text-muted hover:bg-surface-sunken sm:flex"
            aria-label="Open the command palette"
          >
            Search
            <kbd className="rounded bg-surface-sunken px-1 font-sans text-[10px]">
              ⌘K
            </kbd>
          </button>
          <ConnectionIndicator />
          <ThemeToggle />
          {user && (
            <span className="hidden text-xs text-text-muted lg:inline">
              {[user.first_name, user.last_name].filter(Boolean).join(" ") ||
                "Operator"}
              <span className="ml-1 rounded bg-surface-sunken px-1 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                {user.role}
              </span>
            </span>
          )}
          <Button size="sm" variant="ghost" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {drawerOpen && (
          <div className="fixed inset-0 z-30 md:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-scrim"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="relative h-full w-56 shadow-xl">
              <Sidebar variant="drawer" onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 px-3 py-3 md:px-5 md:py-4">
          {children}
        </main>
      </div>

      <CommandPalette />
    </div>
  );
}
