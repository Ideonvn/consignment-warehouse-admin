"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import { Panel } from "@/components/ui/Panel";
import {
  confirmLotImage,
  deleteLotImage,
  presignLotImage,
  updateLotImage,
} from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/errors";
import { useLotImages } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { useDirectUpload } from "@/lib/api/use-direct-upload";
import { UploadProgress } from "@/components/ui/UploadProgress";
import { ALLOWED_IMAGE_TYPES } from "@/types/api";
import { cn } from "@/lib/utils";
import type { LotImageAdmin } from "@/types/api";

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-4 w-4"
    >
      <path d="M2.5 4h11" />
      <path d="M6.5 4V2.5h3V4" />
      <path d="M4 4l.6 9a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L12 4" />
      <path d="M6.5 6.5v5M9.5 6.5v5" />
    </svg>
  );
}

export function LotImages({
  lotId,
  limit,
}: {
  lotId: string;
  /**
   * The server's cap, from `GET /admin/lots/{id}`. 0 means the backend did not
   * send one, in which case nothing is counted or disabled and the API stays
   * the only authority — the same position this screen was in before the cap.
   */
  limit: number;
}) {
  const client = useQueryClient();
  const { data, isPending } = useLotImages(lotId);
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = useState(false);
  const [dragImageId, setDragImageId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<LotImageAdmin | null>(null);

  const images = [...(data ?? [])].sort((a, b) => a.position - b.position);
  // Exactly one image is primary. If none is flagged the bidder app treats the
  // lowest position as primary, so the operator sees the same thing here.
  const flaggedPrimary = images.find((image) => image.is_primary);
  const effectivePrimaryId = flaggedPrimary?.id ?? images[0]?.id ?? null;

  // The count comes from the image list, not from the lot's `image_count`: the
  // list is what this screen renders and what a delete here updates, so the two
  // numbers beside each other can never disagree. The cap is the lot's, because
  // nothing else knows it.
  const capped = limit > 0;
  const full = capped && images.length >= limit;

  function refresh() {
    void client.invalidateQueries({ queryKey: queryKeys.lotImages(lotId) });
  }

  const { uploads, upload } = useDirectUpload({
    presign: (file) =>
      presignLotImage(lotId, {
        content_type: file.type,
        size_bytes: file.size,
      }),
    confirm: ({ presign, dimensions, index }) =>
      confirmLotImage(lotId, {
        storage_key: presign.storage_key,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        is_primary: false,
        position: index,
      }),
    onUploaded: refresh,
  });

  function handleFiles(files: FileList | File[]) {
    // Refetched after the batch whatever happened, not only per success: a cap
    // refusal means another operator's photos are already on this lot and our
    // counter is behind. The refusal carries `image_count`, but re-reading the
    // list gets the thumbnails with it.
    void upload(files, images.length).then(refresh);
  }

  const makePrimary = useMutation({
    mutationFn: (image: LotImageAdmin) =>
      updateLotImage(lotId, image.id, { is_primary: true }),
    onMutate: async (image) => {
      await client.cancelQueries({ queryKey: queryKeys.lotImages(lotId) });
      const previous = client.getQueryData<LotImageAdmin[]>(
        queryKeys.lotImages(lotId),
      );
      client.setQueryData<LotImageAdmin[]>(queryKeys.lotImages(lotId), (old) =>
        (old ?? []).map((item) => ({
          ...item,
          is_primary: item.id === image.id,
        })),
      );
      return { previous };
    },
    onError: (error, _image, context) => {
      if (context?.previous) {
        client.setQueryData(queryKeys.lotImages(lotId), context.previous);
      }
      toast.error(errorMessage(error));
    },
    onSuccess: () => {
      toast.success("Primary photo changed. Bidders see this one first.");
    },
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: (image: LotImageAdmin) => deleteLotImage(lotId, image.id),
    onSuccess: () => {
      refresh();
      toast.success("Photo deleted");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const reorder = useMutation({
    mutationFn: async (ordered: LotImageAdmin[]) => {
      // Only the images whose position actually moved need a PATCH.
      for (let index = 0; index < ordered.length; index += 1) {
        const image = ordered[index];
        if (image.position !== index) {
          await updateLotImage(lotId, image.id, { position: index });
        }
      }
    },
    // Optimistic: a drag that snaps back while the PATCHes fly is unusable.
    onMutate: async (ordered) => {
      await client.cancelQueries({ queryKey: queryKeys.lotImages(lotId) });
      const previous = client.getQueryData<LotImageAdmin[]>(
        queryKeys.lotImages(lotId),
      );
      client.setQueryData<LotImageAdmin[]>(
        queryKeys.lotImages(lotId),
        ordered.map((image, index) => ({ ...image, position: index })),
      );
      return { previous };
    },
    onError: (error, _ordered, context) => {
      if (context?.previous) {
        client.setQueryData(queryKeys.lotImages(lotId), context.previous);
      }
      toast.error(errorMessage(error));
    },
    onSuccess: () => toast.success("Photo order saved"),
    onSettled: refresh,
  });

  function handleDrop(targetId: string) {
    if (!dragImageId || dragImageId === targetId) return;
    const from = images.findIndex((image) => image.id === dragImageId);
    const to = images.findIndex((image) => image.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDragImageId(null);
    reorder.mutate(next);
  }

  return (
    <Panel
      title="Photos"
      description={
        capped
          ? `${images.length} of ${limit} · the primary one is what bidders see first`
          : `${images.length} on this lot · the primary one is what bidders see first`
      }
      actions={
        <Button
          size="sm"
          disabled={full}
          title={full ? `This lot is at its limit of ${limit} photos` : undefined}
          onClick={() => inputRef.current?.click()}
        >
          Add photos
        </Button>
      }
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          if (event.target.files) void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!dragImageId) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (full) return;
          if (event.dataTransfer.files.length > 0) {
            void handleFiles(event.dataTransfer.files);
          }
        }}
        className={cn(
          "mb-3 rounded border border-dashed px-3 py-4 text-center text-sm",
          full
            ? "border-border-strong text-text-muted"
            : dragOver
              ? "border-accent bg-info-tint text-accent-strong"
              : "border-border-strong text-text-muted",
        )}
      >
        {full ? (
          <>
            This lot has all {limit} photos it can hold. Delete one to add
            another.
            <p className="mt-1 text-xs">
              The server enforces this too, so a photo added from another device
              can put the lot at its limit before this screen catches up.
            </p>
          </>
        ) : (
          <>
            Drop photos here, or{" "}
            <button
              type="button"
              className="font-medium text-accent-strong underline"
              onClick={() => inputRef.current?.click()}
            >
              choose files
            </button>
            <p className="mt-1 text-xs">
              JPEG, PNG or WebP · up to 10 MB each
              {capped && ` · ${limit - images.length} more can be added`}
            </p>
          </>
        )}
      </div>

      <UploadProgress uploads={uploads} />

      {isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : images.length === 0 ? (
        <EmptyState
          title="No photos"
          description="Bidders see a placeholder until this lot has at least one photo."
        />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-2">
            {images.map((image) => {
              const isPrimary = image.id === effectivePrimaryId;
              return (
                <li
                  key={image.id}
                  draggable
                  onDragStart={() => setDragImageId(image.id)}
                  onDragEnd={() => setDragImageId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleDrop(image.id);
                  }}
                  className={cn(
                    "overflow-hidden rounded border bg-surface",
                    isPrimary
                      ? "border-accent ring-1 ring-accent"
                      : "border-border",
                    dragImageId === image.id && "opacity-40",
                  )}
                >
                  <div className="relative cursor-grab">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt=""
                      loading="lazy"
                      // Contained, never cropped: this is the surface the
                      // operator judges a photo on, and a cropped preview hides
                      // what a bidder will see. The box keeps aspect-square so
                      // the grid does not go ragged; the bands are black
                      // because a theme-coloured one reads as a layout bug.
                      className="aspect-square w-full bg-letterbox object-contain"
                    />
                    {isPrimary && (
                      <span
                        className="absolute top-1 left-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-ink"
                        title={
                          flaggedPrimary
                            ? "Flagged as the primary photo"
                            : "No photo is flagged primary, so the lowest position is used — the same rule the bidder app applies"
                        }
                      >
                        {flaggedPrimary ? "Primary" : "Primary*"}
                      </span>
                    )}
                  </div>

                  {/*
                   * The controls sit BELOW the photo, on a known surface, and are
                   * always visible.
                   *
                   * They used to be overlaid on the image and revealed on hover,
                   * which drew nothing at all on a touch device — and this app is
                   * meant to be usable on a phone in a warehouse. Overlaying them
                   * also put small text on top of an arbitrary uploaded
                   * photograph, where contrast cannot be guaranteed; on --surface
                   * it is a measured token pairing.
                   *
                   * draggable={false} so a press on a control does not start
                   * dragging the thumbnail instead of activating the button.
                   */}
                  <div
                    draggable={false}
                    onDragStart={(event) => event.stopPropagation()}
                    className="flex items-stretch border-t border-border"
                  >
                    {isPrimary ? (
                      <span className="flex min-h-11 flex-1 items-center justify-center px-2 text-xs font-medium text-accent-strong">
                        Primary
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => makePrimary.mutate(image)}
                        title="Show this photo to bidders first"
                        className="flex min-h-11 flex-1 items-center justify-center px-2 text-xs font-medium text-text hover:bg-surface-sunken"
                      >
                        Make primary
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleting(image)}
                      aria-label="Delete this photo"
                      title="Delete this photo"
                      className="flex min-h-11 w-11 shrink-0 items-center justify-center border-l border-border text-danger-ink hover:bg-danger-tint"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-text-muted">
            Drag a thumbnail onto another to reorder.{" "}
            {!flaggedPrimary &&
              "No photo is flagged primary, so the first one is used — the same rule the bidder app applies."}
          </p>
        </>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this photo"
        tone="danger"
        confirmLabel="Delete the photo"
        description={
          <div className="flex flex-col gap-2">
            <p>
              The photo is removed from this lot and bidders stop seeing it.
              {deleting?.id === effectivePrimaryId &&
                " It is the primary photo, so the next one in order takes its place."}
            </p>
            {images.length === 1 && (
              <p>
                It is the only photo on this lot — bidders will see a
                placeholder instead.
              </p>
            )}
          </div>
        }
        onConfirm={() => (deleting ? remove.mutateAsync(deleting) : undefined)}
      />
    </Panel>
  );
}
