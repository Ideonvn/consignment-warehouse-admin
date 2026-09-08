"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { EmptyState, Note, Skeleton } from "@/components/ui/Feedback";
import { Input, Textarea } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { UploadProgress } from "@/components/ui/UploadProgress";
import { confirmLotImage, createLot, presignLotImage } from "@/lib/api/endpoints";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { useAuction, useAuctionInvalidation } from "@/lib/api/queries";
import { useDirectUpload } from "@/lib/api/use-direct-upload";
import { formatMoney } from "@/lib/format/money";
import { useSetAuctionContext } from "@/lib/ui/auction-context";
import { usePageTitle } from "@/lib/ui/use-page-title";
import type { LotAdminSummary } from "@/types/api";
import {
  PendingImages,
  revokePendingImages,
  type PendingImage,
} from "./PendingImages";

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

/** A created lot whose photos did not all attach, held for a retry. */
interface Stranded {
  lot: LotAdminSummary;
  images: PendingImage[];
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
  const [images, setImages] = useState<PendingImage[]>([]);
  const [added, setAdded] = useState<LotAdminSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stranded, setStranded] = useState<Stranded | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const auction = auctionQuery.data;
  const currency = auction?.currency_code ?? "ZAR";

  /**
   * Which lot the uploader is currently attaching to.
   *
   * The hook's presign and confirm closures are created once, but the lot they
   * target does not exist until the moment of submit — and changes again on
   * retry. A ref is the honest way to say "whatever lot we are on now".
   */
  const targetLotId = useRef<string | null>(null);
  const primaryIndex = useRef<number | null>(null);

  const { uploads, upload, clear: clearUploads } = useDirectUpload({
    presign: (file) =>
      presignLotImage(targetLotId.current!, {
        content_type: file.type,
        size_bytes: file.size,
      }),
    confirm: ({ presign, dimensions, index }) =>
      confirmLotImage(targetLotId.current!, {
        storage_key: presign.storage_key,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        // Position and primary are applied as each photo is confirmed rather
        // than patched afterwards: the order was decided before upload, so
        // there is nothing to discover and nothing to correct.
        is_primary: index === primaryIndex.current,
        position: index,
      }),
  });

  // Previews outlive React state only if nobody revokes them. Every deliberate
  // discard revokes as it goes; this catches the operator navigating away
  // mid-session with photos still held.
  const liveImages = useRef<PendingImage[]>([]);
  useEffect(() => {
    liveImages.current = [...images, ...(stranded?.images ?? [])];
  });
  useEffect(() => () => revokePendingImages(liveImages.current), []);

  function resetImages() {
    revokePendingImages(images);
    setImages([]);
  }

  /**
   * Attach held photos to a lot that now exists.
   *
   * Sequential and in array order, so `position` matches what the operator
   * arranged. Whatever fails comes back so the caller can keep those files
   * rather than lose them with the form reset.
   */
  async function attach(lot: LotAdminSummary, files: PendingImage[]) {
    targetLotId.current = lot.id;
    const flagged = files.findIndex((image) => image.isPrimary);
    // Nothing flagged means the first photo, the same rule the gallery and the
    // bidder app apply.
    primaryIndex.current = flagged >= 0 ? flagged : 0;

    const outcomes = await upload(files.map((image) => image.file));
    return files.filter((_, index) => !outcomes[index]?.ok);
  }

  const create = useMutation({
    mutationFn: async () => {
      const lot = await createLot(auctionId, {
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
      });

      // The lot exists from here on. An image failure is reported and the files
      // are kept for another go — it never costs the operator the record they
      // just typed.
      const failed = images.length > 0 ? await attach(lot, images) : [];
      return { lot, failed };
    },
    onSuccess: ({ lot, failed }) => {
      invalidate(auctionId);
      setAdded((prev) => [lot, ...prev]);

      // Only the photos that landed are revoked; the rest move to the stranded
      // panel with their previews intact so they can be retried.
      revokePendingImages(images.filter((image) => !failed.includes(image)));
      setImages([]);
      setDraft(EMPTY);
      setError(null);

      if (failed.length > 0) {
        setStranded({ lot, images: failed });
        toast.warning(
          `Lot ${lot.lot_number ?? ""} "${lot.title}" was created, but ${failed.length} photo${
            failed.length === 1 ? "" : "s"
          } did not attach.`,
        );
      } else {
        setStranded(null);
        clearUploads();
        toast.success(`Lot ${lot.lot_number ?? ""} "${lot.title}" added`);
      }
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

  const retry = useMutation({
    mutationFn: async (batch: Stranded) => attach(batch.lot, batch.images),
    onSuccess: (failed, batch) => {
      invalidate(auctionId);
      revokePendingImages(batch.images.filter((image) => !failed.includes(image)));
      if (failed.length > 0) {
        setStranded({ ...batch, images: failed });
        toast.warning(
          `${failed.length} photo${failed.length === 1 ? "" : "s"} still did not attach.`,
        );
      } else {
        setStranded(null);
        clearUploads();
        toast.success("Photos attached.");
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
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

              <PendingImages
                images={images}
                onChange={setImages}
                disabled={create.isPending}
              />

              {create.isPending && images.length > 0 && (
                <UploadProgress uploads={uploads} />
              )}

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
                    resetImages();
                    setError(null);
                    titleRef.current?.focus();
                  }}
                >
                  Clear form
                </Button>
                <span className="text-xs text-text-muted">
                  Enter submits. Lots are created as drafts and go live when the
                  auction is published.
                  {images.length > 0 &&
                    ` ${images.length} photo${images.length === 1 ? "" : "s"} upload after the lot is created.`}
                </span>
              </div>
            </div>
          </Panel>
        </form>

        <div className="flex flex-col gap-4">
          {stranded && (
            <Panel
              title="Photos did not attach"
              description={`Lot ${stranded.lot.lot_number ?? ""} was created — only its photos failed.`}
            >
              <Note tone="warning" className="mb-3">
                <strong>
                  #{stranded.lot.lot_number ?? "—"} {stranded.lot.title}
                </strong>{" "}
                exists and is in the list below. {stranded.images.length} photo
                {stranded.images.length === 1 ? "" : "s"} did not attach:
              </Note>

              <UploadProgress uploads={uploads} />

              <ul className="mb-3 flex flex-wrap gap-2">
                {stranded.images.map((image) => (
                  <li key={image.id} className="w-20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt=""
                      className="aspect-square w-full rounded border border-border bg-letterbox object-contain"
                    />
                    <p className="truncate text-[11px] text-text-muted" title={image.file.name}>
                      {image.file.name}
                    </p>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  loading={retry.isPending}
                  onClick={() => retry.mutate(stranded)}
                >
                  Try these again
                </Button>
                <Link href={`/lots/${stranded.lot.id}`}>
                  <Button variant="secondary" size="sm">
                    Open the lot instead
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    revokePendingImages(stranded.images);
                    setStranded(null);
                    clearUploads();
                  }}
                >
                  Discard these photos
                </Button>
              </div>
              <p className="mt-2 text-xs text-text-muted">
                The lot keeps everything else you typed. Adding photos on its own
                page works too — this panel is only here to save you the trip.
              </p>
            </Panel>
          )}

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
              Photos added on the form are already attached. To change them
              later, open a lot above.
            </Note>
          )}
        </Panel>
        </div>
      </div>
    </>
  );
}
