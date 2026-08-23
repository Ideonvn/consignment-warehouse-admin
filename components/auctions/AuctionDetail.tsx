"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Countdown } from "@/components/ui/Countdown";
import { DataPoint, Panel } from "@/components/ui/Panel";
import { ErrorState, Skeleton } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tabs } from "@/components/ui/Tabs";
import { createIncrementRule, deleteIncrementRule } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/errors";
import {
  useAuction,
  useIncrementRules,
  useLots,
} from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { formatDateTime } from "@/lib/format/datetime";
import { toBands, type IncrementBand } from "@/lib/format/increments";
import { useSetAuctionContext } from "@/lib/ui/auction-context";
import { useNow } from "@/lib/ui/hooks";
import { usePageTitle } from "@/lib/ui/use-page-title";
import { useQueryClient } from "@tanstack/react-query";
import { AuctionActions } from "./AuctionActions";
import { AuctionEditForm } from "./AuctionEditForm";
import { AuctionImage } from "./AuctionImage";
import { AuctionVisibility } from "./AuctionVisibility";
import { AuctionParticipants } from "./AuctionParticipants";
import { IncrementRulesEditor } from "./IncrementRulesEditor";
import { LotsTab } from "@/components/lots/LotsTab";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "lots", label: "Lots" },
  { id: "participants", label: "Participants" },
  { id: "increments", label: "Increments" },
];

export function AuctionDetail({ auctionId }: { auctionId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const client = useQueryClient();
  const tab = params.get("tab") ?? "overview";
  const nowMs = useNow(30_000);

  const auctionQuery = useAuction(auctionId);
  const lotsQuery = useLots(auctionId);
  const rulesQuery = useIncrementRules(auctionId);

  useSetAuctionContext(auctionQuery.data);
  usePageTitle(auctionQuery.data?.name);

  const auction = auctionQuery.data;
  const lots = lotsQuery.data ?? [];
  const bands = toBands(rulesQuery.data ?? []);
  const usingGlobalFallback = bands.length > 0 && bands.every((b) => b.isGlobal);

  const addRule = useMutation({
    mutationFn: (band: { minPriceMinor: number; incrementMinor: number }) =>
      createIncrementRule(auctionId, {
        min_price_minor: band.minPriceMinor,
        increment_minor: band.incrementMinor,
      }),
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: queryKeys.incrementRules(auctionId),
      });
      toast.success("Increment band added");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const removeRule = useMutation({
    mutationFn: (band: IncrementBand) => deleteIncrementRule(auctionId, band.id!),
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: queryKeys.incrementRules(auctionId),
      });
      toast.success("Increment band removed");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (auctionQuery.error) {
    return (
      <ErrorState
        title="Could not load that auction"
        message={errorMessage(auctionQuery.error)}
        onRetry={() => void auctionQuery.refetch()}
      />
    );
  }

  if (!auction) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // A scheduled auction whose opening time has already passed is waiting on the
  // backend to flip it, not "opening in -3 minutes" — count down to the close.
  const startInFuture =
    nowMs !== null && Date.parse(auction.starts_at) > nowMs;
  const countdown =
    auction.status === "scheduled" && startInFuture
      ? { label: "Opens in", to: auction.starts_at }
      : { label: "Time left", to: auction.ends_at };

  function setTab(next: string) {
    router.replace(`/auctions/${auctionId}${next === "overview" ? "" : `?tab=${next}`}`);
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Auctions", href: "/auctions" }, { label: auction.name }]}
        title={
          <span className="flex items-center gap-2">
            {auction.name}
            <StatusBadge status={auction.status} kind="auction" />
          </span>
        }
        subtitle={
          <span className="font-mono text-xs">{auction.slug}</span>
        }
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => router.push(`/auctions/${auctionId}/lots/new`)}
            >
              Add lots
            </Button>
            <Link href={`/auctions/${auctionId}/monitor`}>
              <Button variant="secondary">Monitor</Button>
            </Link>
            <AuctionActions auction={auction} lots={lots} />
          </>
        }
      />

      <Panel className="mb-3" bodyClassName="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <DataPoint label="Opens">{formatDateTime(auction.starts_at)}</DataPoint>
        <DataPoint label="Closes">{formatDateTime(auction.ends_at)}</DataPoint>
        <DataPoint label={countdown.label}>
          <Countdown to={countdown.to} />
        </DataPoint>
        <DataPoint label="Lots">
          <span className="tnum">{lotsQuery.isPending ? "·" : lots.length}</span>
        </DataPoint>
        <DataPoint label="Anti-snipe">
          <span className="tnum">
            {auction.anti_snipe_window_seconds}s window ·{" "}
            {auction.anti_snipe_extension_seconds}s extension · max{" "}
            {auction.max_extensions}
          </span>
        </DataPoint>
      </Panel>

      <Tabs
        tabs={TABS.map((t) =>
          t.id === "lots" ? { ...t, count: lots.length } : t,
        )}
        active={tab}
        onChange={setTab}
        className="mb-3"
      />

      {tab === "overview" && (
        <div className="flex flex-col gap-4">
          <AuctionEditForm auction={auction} lots={lots} />
          {/* Both of these sit outside the edit form on purpose: neither
              image_url nor visibility is frozen when a lot has a bid, and the
              form is where the freezing rules live. */}
          <AuctionVisibility auction={auction} lots={lots} />
          <AuctionImage auction={auction} />
        </div>
      )}

      {tab === "lots" && <LotsTab auction={auction} />}

      {tab === "participants" && <AuctionParticipants auction={auction} />}

      {tab === "increments" && (
        <Panel
          title="Increment rules"
          description="The band with the highest floor at or below the current price decides the next bid step."
        >
          {rulesQuery.isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <IncrementRulesEditor
              bands={bands}
              currency={auction.currency_code}
              usingGlobalFallback={usingGlobalFallback || bands.length === 0}
              busy={addRule.isPending || removeRule.isPending}
              onAdd={(band) => addRule.mutateAsync(band)}
              onDelete={(band) => removeRule.mutateAsync(band)}
            />
          )}
        </Panel>
      )}
    </>
  );
}
