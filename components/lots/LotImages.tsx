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
import {
  postToStorage,
  readImageDimensions,
  StorageUploadError,
  validateImageFile,
} from "@/lib/api/upload";
import { ALLOWED_IMAGE_TYPES } from "@/types/api";
import { cn } from "@/lib/utils";
import type { LotImageAdmin } from "@/types/api";

interface UploadItem {
  id: string;
  name: string;
  progress: number;
  status: "validating" | "uploading" | "confirming" | "done" | "failed";
  error?: string;
}

export function LotImages({ lotId }: { lotId: string }) {
  const client = useQueryClient();
  const { data, isPending } = useLotImages(lotId);
  const inputRef = useRef<HTMLInputElement>(null);

  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [dragImageId, setDragImageId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<LotImageAdmin | null>(null);

  const images = [...(data ?? [])].sort((a, b) => a.position - b.position);
  // Exactly one image is primary. If none is flagged the bidder app treats the
  // lowest position as primary, so the operator sees the same thing here.
  const flaggedPrimary = images.find((image) => image.is_primary);
  const effectivePrimaryId = flaggedPrimary?.id ?? images[0]?.id ?? null;

  function refresh() {
    void client.invalidateQueries({ queryKey: queryKeys.lotImages(lotId) });
  }

  function patchUpload(id: string, patch: Partial<UploadItem>) {
    setUploads((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  async function uploadOne(file: File, position: number) {
    const id = crypto.randomUUID();
    setUploads((prev) => [
      ...prev,
      { id, name: file.name, progress: 0, status: "validating" },
    ]);

    const invalid = validateImageFile(file);
    if (invalid) {
      patchUpload(id, { status: "failed", error: invalid });
      return;
    }

    try {
      const dimensions = await readImageDimensions(file);
      const presign = await presignLotImage(lotId, {
        content_type: file.type,
        size_bytes: file.size,
      });

      patchUpload(id, { status: "uploading" });
      await postToStorage(presign, file, (fraction) =>
        patchUpload(id, { progress: fraction }),
      );

      patchUpload(id, { status: "confirming", progress: 1 });
      await confirmLotImage(lotId, {
        storage_key: presign.storage_key,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        is_primary: false,
        position,
      });

      patchUpload(id, { status: "done" });
      setTimeout(
        () => setUploads((prev) => prev.filter((item) => item.id !== id)),
        1500,
      );
      refresh();
    } catch (error) {
      // A storage rejection and an API validation failure need different words:
      // one means the bytes never landed, the other means they did but the API
      // would not record them.
      const message =
        error instanceof StorageUploadError
          ? error.message
          : `The API rejected the upload: ${errorMessage(error)}`;
      patchUpload(id, { status: "failed", error: message });
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    let position = images.length;
    for (const file of list) {
      await uploadOne(file, position);
      position += 1;
    }
  }

  // Optimistic, because it is a frequent, reversible, non-financial change and
  // the operator is usually clicking through several photos in a row. Money and
  // destructive actions are deliberately NOT optimistic.
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
      description={`${images.length} on this lot · the primary one is what bidders see first`}
      actions={
        <Button size="sm" onClick={() => inputRef.current?.click()}>
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
          if (event.dataTransfer.files.length > 0) {
            void handleFiles(event.dataTransfer.files);
          }
        }}
        className={cn(
          "mb-3 rounded border border-dashed px-3 py-4 text-center text-sm",
          dragOver
            ? "border-accent bg-info-tint text-accent-strong"
            : "border-border-strong text-text-muted",
        )}
      >
        Drop photos here, or{" "}
        <button
          type="button"
          className="font-medium text-accent-strong underline"
          onClick={() => inputRef.current?.click()}
        >
          choose files
        </button>
        <p className="mt-1 text-xs">JPEG, PNG or WebP · up to 10 MB each</p>
      </div>

      {uploads.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1.5">
          {uploads.map((item) => (
            <li key={item.id} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{item.name}</span>
                <span
                  className={cn(
                    "tnum shrink-0",
                    item.status === "failed"
                      ? "text-danger"
                      : item.status === "done"
                        ? "text-success-ink"
                        : "text-text-muted",
                  )}
                >
                  {item.status === "failed"
                    ? "failed"
                    : item.status === "done"
                      ? "done"
                      : item.status === "confirming"
                        ? "saving…"
                        : `${Math.round(item.progress * 100)}%`}
                </span>
              </div>
              <div className="mt-0.5 h-1 w-full overflow-hidden rounded bg-surface-sunken">
                <div
                  className={cn(
                    "h-full transition-[width]",
                    item.status === "failed" ? "bg-danger" : "bg-accent",
                  )}
                  style={{
                    width: `${item.status === "failed" ? 100 : item.progress * 100}%`,
                  }}
                />
              </div>
              {item.error && (
                <p role="alert" className="mt-0.5 text-danger">
                  {item.error}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : images.length === 0 ? (
        <EmptyState
          title="No photos"
          description="Bidders see a placeholder until this lot has at least one photo."
        />
      ) : (
        <>
          <ul className="grid grid-cols-3 gap-2">
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
                    "group relative cursor-grab",
                    dragImageId === image.id && "opacity-40",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt=""
                    loading="lazy"
                    className={cn(
                      "aspect-square w-full rounded border object-cover",
                      isPrimary
                        ? "border-accent ring-1 ring-accent"
                        : "border-border",
                    )}
                  />
                  {isPrimary && (
                    <span
                      className="absolute top-1 left-1 rounded bg-accent px-1 text-[10px] font-semibold text-accent-ink"
                      title={
                        flaggedPrimary
                          ? "Flagged as the primary photo"
                          : "No photo is flagged primary, so the lowest position is used — the same rule the bidder app applies"
                      }
                    >
                      {flaggedPrimary ? "primary" : "primary*"}
                    </span>
                  )}
                  <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    {!isPrimary && (
                      <button
                        type="button"
                        onClick={() => makePrimary.mutate(image)}
                        className="rounded bg-surface/90 px-1 text-[10px] font-medium hover:bg-surface"
                      >
                        Make primary
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleting(image)}
                      className="ml-auto rounded bg-surface/90 px-1 text-[10px] font-medium text-danger hover:bg-surface"
                    >
                      Delete
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
