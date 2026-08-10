"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { EmptyState, Note, Skeleton } from "@/components/ui/Feedback";
import { Input, Textarea } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createLot } from "@/lib/api/endpoints";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { useAuction, useAuctionInvalidation } from "@/lib/api/queries";
import { formatMoney } from "@/lib/format/money";
import { useSetAuctionContext } from "@/lib/ui/auction-context";
import { usePageTitle } from "@/lib/ui/use-page-title";
import type { LotAdminSummary } from "@/types/api";

interface Draft {
  title: string;
  description: string;
  startingPriceMinor: number | null;
  reservePriceMinor: number | null;
  overrideIncrement: boolean;
  incrementMinor: number | null;
  autoLotNumber: boolean;
  lotNumber: string;
}

const EMPTY: Draft = {
  title: "",
  description: "",
  startingPriceMinor: null,
  reservePriceMinor: null,
  overrideIncrement: false,
  incrementMinor: null,
  autoLotNumber: true,
  lotNumber: "",
};

/**
 * Built for a listing session, not a single record: the form stays open,
 * resets, keeps the auction context and shows what has been added so far.
 */
export function LotCreateForm({ auctionId }: { auctionId: string }) {
  const router = useRouter();
  const invalidate = useAuctionInvalidation();
  const auctionQuery = useAuction(auctionId);
  useSetAuctionContext(auctionQuery.data);
  usePageTitle("Add lots");

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [added, setAdded] = useState<LotAdminSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const auction = auctionQuery.data;
  const currency = auction?.currency_code ?? "ZAR";

  const create = useMutation({
    mutationFn: () =>
      createLot(auctionId, {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        starting_price_minor: draft.startingPriceMinor ?? 0,
        bid_increment_minor: draft.overrideIncrement
          ? draft.incrementMinor
          : null,
        reserve_price_minor: draft.reservePriceMinor,
        lot_number: draft.autoLotNumber
          ? null
          : Number.parseInt(draft.lotNumber, 10),
      }),
    onSuccess: (lot) => {
      invalidate(auctionId);
      setAdded((prev) => [lot, ...prev]);
      setDraft(EMPTY);
      setError(null);
      toast.success(`Lot ${lot.lot_number ?? ""} "${lot.title}" added`);
      titleRef.current?.focus();
    },
    onError: (err) => {
      if (isApiError(err) && err.status === 409) {
        setError(
          "That lot number is already taken in this auction. Use auto-numbering or pick another.",
        );
      } else {
        setError(errorMessage(err));
      }
    },
  });

  function validate(): string | null {
    if (!draft.title.trim()) return "Give the lot a title";
    if (draft.startingPriceMinor === null) return "Set a starting price";
    if (draft.overrideIncrement && !draft.incrementMinor) {
      return "Set the override increment, or switch back to the auction's bands";
    }
    if (
      draft.reservePriceMinor !== null &&
      draft.startingPriceMinor !== null &&
      draft.reservePriceMinor < draft.startingPriceMinor
    ) {
      return "A reserve below the starting price has no effect — leave it empty instead";
    }
    if (!draft.autoLotNumber && !/^\d+$/.test(draft.lotNumber)) {
      return "Lot number must be a whole number";
    }
    return null;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    create.mutate();
  }

  if (auctionQuery.isPending) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Auctions", href: "/auctions" },
          { label: auction?.name ?? "Auction", href: `/auctions/${auctionId}` },
          { label: "Add lots" },
        ]}
        title="Add lots"
        subtitle="The form stays open and clears itself, so you can work through a pile of stock without leaving the page."
        actions={
          <Button
            variant="secondary"
            onClick={() => router.push(`/auctions/${auctionId}?tab=lots`)}
          >
            Done
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <form onSubmit={submit}>
          <Panel title="New lot">
            <div className="flex flex-col gap-3">
              <Field label="Title" htmlFor="lot-title" required>
                <Input
                  id="lot-title"
                  ref={titleRef}
                  autoFocus
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Vintage Omega Seamaster"
                />
              </Field>

              <Field
                label="Description"
                htmlFor="lot-desc"
                hint="Condition, provenance, flaws. Bidders see this."
              >
                <Textarea
                  id="lot-desc"
                  rows={4}
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Starting price" required>
                  <MoneyInput
                    value={draft.startingPriceMinor}
                    currency={currency}
                    onChange={(minor) =>
                      setDraft({ ...draft, startingPriceMinor: minor })
                    }
                  />
                </Field>

                <Field
                  label="Reserve"
                  hint="Optional, and never shown to bidders. It freezes as soon as this lot has a bid — the escape hatch afterwards is Accept reserve, not moving it."
                >
                  <MoneyInput
                    value={draft.reservePriceMinor}
                    currency={currency}
                    onChange={(minor) =>
                      setDraft({ ...draft, reservePriceMinor: minor })
                    }
                  />
                </Field>
              </div>

              <fieldset className="flex flex-col gap-2 rounded border border-border px-3 py-2">
                <legend className="px-1 text-xs font-medium">
                  Bid increment
                </legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="increment-mode"
                    checked={!draft.overrideIncrement}
                    onChange={() =>
                      setDraft({ ...draft, overrideIncrement: false })
                    }
                  />
                  Use the auction&apos;s increment bands
                  <span className="text-xs text-text-muted">
                    (falls back to the global set)
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="increment-mode"
                    checked={draft.overrideIncrement}
                    onChange={() =>
                      setDraft({ ...draft, overrideIncrement: true })
                    }
                  />
                  Override for this lot
                </label>
                {draft.overrideIncrement && (
                  <div className="w-44 pl-6">
                    <MoneyInput
                      value={draft.incrementMinor}
                      currency={currency}
                      onChange={(minor) =>
                        setDraft({ ...draft, incrementMinor: minor })
                      }
                    />
                  </div>
                )}
              </fieldset>

              <fieldset className="flex flex-wrap items-center gap-4 rounded border border-border px-3 py-2">
                <legend className="px-1 text-xs font-medium">Lot number</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="lot-number-mode"
                    checked={draft.autoLotNumber}
                    onChange={() => setDraft({ ...draft, autoLotNumber: true })}
                  />
                  Next free number
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="lot-number-mode"
                    checked={!draft.autoLotNumber}
                    onChange={() => setDraft({ ...draft, autoLotNumber: false })}
                  />
                  Set it myself
                </label>
                {!draft.autoLotNumber && (
                  <Input
                    type="number"
                    min={1}
                    className="tnum w-24"
                    aria-label="Lot number"
                    value={draft.lotNumber}
                    onChange={(e) =>
                      setDraft({ ...draft, lotNumber: e.target.value })
                    }
                  />
                )}
              </fieldset>

              {error && (
                <p
                  role="alert"
                  className="rounded border border-danger bg-danger-tint px-2 py-1.5 text-sm text-danger-ink"
                >
                  {error}
                </p>
              )}

              <div className="flex items-center gap-2 border-t border-border pt-3">
                <Button
                  type="submit"
                  variant="primary"
                  loading={create.isPending}
                >
                  Add lot and keep going
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDraft(EMPTY);
                    setError(null);
                    titleRef.current?.focus();
                  }}
                >
                  Clear form
                </Button>
                <span className="text-xs text-text-muted">
                  Enter submits. Lots are created as drafts and go live when the
                  auction is published.
                </span>
              </div>
            </div>
          </Panel>
        </form>

        <Panel
          title="Added this session"
          description={`${added.length} lot${added.length === 1 ? "" : "s"}`}
        >
          {added.length === 0 ? (
            <EmptyState
              title="Nothing added yet"
              description="Lots you add will collect here so you can check your work as you go."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {added.map((lot) => (
                <li
                  key={lot.id}
                  className="flex items-start justify-between gap-2 border-b border-border pb-2 last:border-b-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/lots/${lot.id}`}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      #{lot.lot_number ?? "—"} {lot.title}
                    </Link>
                    <p className="tnum text-xs text-text-muted">
                      Start {formatMoney(lot.starting_price_minor, currency)}
                      {lot.reserve_price_minor !== null &&
                        ` · reserve ${formatMoney(lot.reserve_price_minor, currency)}`}
                    </p>
                  </div>
                  <StatusBadge status={lot.status} kind="lot" />
                </li>
              ))}
            </ul>
          )}

          {added.length > 0 && (
            <Note tone="info" className="mt-3">
              Photos are added per lot on its own page — open a lot above to
              upload them.
            </Note>
          )}
        </Panel>
      </div>
    </>
  );
}
