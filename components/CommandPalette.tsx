"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { listUsers } from "@/lib/api/endpoints";
import { useAuctions, useLots } from "@/lib/api/queries";
import { useSessionStore } from "@/lib/auth";
import { useAuctionContextStore } from "@/lib/ui/auction-context";
import { usePaletteStore } from "@/lib/ui/palette";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  href: string;
  label: string;
  detail: string;
  group: "Auction" | "Lot" | "User" | "Go to";
}

const STATIC_ITEMS: Item[] = [
  { id: "nav-auctions", href: "/auctions", label: "Auctions", detail: "All auctions", group: "Go to" },
  { id: "nav-decisions", href: "/decisions", label: "Decisions", detail: "Lots below reserve", group: "Go to" },
  { id: "nav-users", href: "/users", label: "Users", detail: "Find someone", group: "Go to" },
  { id: "nav-new", href: "/auctions/new", label: "New auction", detail: "Create a draft", group: "Go to" },
];

/**
 * Cmd/Ctrl+K. The operator is doing repetitive work; jumping to an auction,
 * lot or person should not need the mouse.
 */
export function CommandPalette() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const open = usePaletteStore((s) => s.open);
  const setOpen = usePaletteStore((s) => s.setOpen);
  const toggle = usePaletteStore((s) => s.toggle);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const authed = useSessionStore((s) => s.status === "authenticated");
  const contextAuction = useAuctionContextStore((s) => s.auction);
  const { data: auctions } = useAuctions({ limit: 200 });
  const { data: lots } = useLots(contextAuction?.id);

  const trimmed = query.trim();
  // Users are searched server-side; phone numbers never enter the URL.
  const { data: users } = useQuery({
    queryKey: ["palette-users", trimmed],
    queryFn: ({ signal }) => listUsers({ search: trimmed, limit: 6 }, signal),
    enabled: authed && open && trimmed.length >= 2,
    staleTime: 30_000,
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const term = trimmed.toLowerCase();
  const items: Item[] = [
    ...STATIC_ITEMS.filter((item) =>
      term ? item.label.toLowerCase().includes(term) : true,
    ),
    ...(auctions ?? [])
      .filter((auction) =>
        term
          ? auction.name.toLowerCase().includes(term) ||
            auction.slug.includes(term)
          : true,
      )
      .slice(0, 6)
      .map((auction) => ({
        id: `a-${auction.id}`,
        href: `/auctions/${auction.id}`,
        label: auction.name,
        detail: `${auction.status} · ${auction.slug}`,
        group: "Auction" as const,
      })),
    ...(lots ?? [])
      .filter((lot) =>
        term
          ? lot.title.toLowerCase().includes(term) ||
            String(lot.lot_number ?? "").includes(term)
          : true,
      )
      .slice(0, 6)
      .map((lot) => ({
        id: `l-${lot.id}`,
        href: `/lots/${lot.id}`,
        label: `#${lot.lot_number ?? "—"} ${lot.title}`,
        detail: `${lot.status} · in ${contextAuction?.name ?? "this auction"}`,
        group: "Lot" as const,
      })),
    ...(users ?? []).slice(0, 6).map((user) => ({
      id: `u-${user.id}`,
      href: `/users/${user.id}`,
      label:
        [user.first_name, user.last_name].filter(Boolean).join(" ") ||
        user.phone_e164,
      detail: `${user.role} · ${user.status}`,
      group: "User" as const,
    })),
  ];

  const clamped = Math.min(active, Math.max(items.length - 1, 0));

  function go(item: Item | undefined) {
    if (!item) return;
    setOpen(false);
    setQuery("");
    setActive(0);
    router.push(item.href);
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        setOpen(false);
      }}
      onClose={() => setOpen(false)}
      onClick={(event) => {
        if (event.target === dialogRef.current) setOpen(false);
      }}
      aria-label="Command palette"
      className="m-auto w-[calc(100vw-2rem)] max-w-lg rounded-lg border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/40"
    >
      <div className="border-b border-border p-2">
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((prev) => Math.min(prev + 1, items.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((prev) => Math.max(prev - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              go(items[clamped]);
            }
          }}
          placeholder="Jump to an auction, lot or person…"
          aria-label="Search"
          className="h-9 w-full rounded border border-border-strong px-2 text-sm"
        />
      </div>

      <ul className="max-h-80 overflow-y-auto p-1">
        {items.length === 0 ? (
          <li className="px-3 py-4 text-center text-sm text-text-muted">
            Nothing matches “{trimmed}”.
            {trimmed.length < 2 && " Type at least two letters to search people."}
          </li>
        ) : (
          items.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => go(item)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-sm",
                  index === clamped ? "bg-[#eff6ff]" : "hover:bg-surface-sunken",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {item.label}
                  </span>
                  <span className="block truncate text-xs text-text-muted">
                    {item.detail}
                  </span>
                </span>
                <span className="shrink-0 rounded bg-surface-sunken px-1 text-[10px] text-text-muted">
                  {item.group}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>

      <p className="border-t border-border px-3 py-1.5 text-[10px] text-text-muted">
        ↑ ↓ to move · Enter to open · Esc to close · Cmd/Ctrl+K to reopen
      </p>
    </dialog>
  );
}
