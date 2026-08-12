"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Panel";
import { UploadProgress } from "@/components/ui/UploadProgress";
import {
  confirmAuctionImage,
  deleteAuctionImage,
  presignAuctionImage,
  updateAuction,
} from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/errors";
import { useAuctionInvalidation } from "@/lib/api/queries";
import { useDirectUpload } from "@/lib/api/use-direct-upload";
import {
  ALLOWED_IMAGE_TYPES,
  auctionImageState,
  IMAGE_URL_RE,
  type AuctionAdmin,
} from "@/types/api";
import { cn } from "@/lib/utils";

const STATE_META = {
  none: {
    label: "No image",
    detail: "Bidders see this auction without a cover photo.",
  },
  external: {
    label: "Linked from a URL",
    detail: "Hosted somewhere else. If that link breaks, the image disappears.",
  },
  uploaded: {
    label: "Uploaded here",
    detail: "Stored with the auction, so it stays available.",
  },
} as const;

/**
 * The auction's cover image, by upload or by URL.
 *
 * Both routes are first class: pointing at an already-hosted photo is a normal
 * thing to do, not a fallback. What differs is only what the operator should
 * know about it — an external link can break, an uploaded file cannot.
 *
 * Replacement is server-side: setting a new image drops the old object, whether
 * it is upload-replaces-URL or the other way round, so there is no
 * delete-then-upload dance here.
 */
export function AuctionImage({ auction }: { auction: AuctionAdmin }) {
  const invalidate = useAuctionInvalidation();
  const inputRef = useRef<HTMLInputElement>(null);

  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const state = auctionImageState(auction);
  const meta = STATE_META[state];

  const { uploads, upload, busy } = useDirectUpload({
    presign: (file) =>
      presignAuctionImage(auction.id, {
        content_type: file.type,
        size_bytes: file.size,
      }),
    confirm: ({ presign }) => confirmAuctionImage(auction.id, presign.storage_key),
    onUploaded: () => {
      invalidate(auction.id);
      toast.success("Cover image updated.");
    },
  });

  const setUrlMutation = useMutation({
    mutationFn: (next: string) =>
      updateAuction(auction.id, { image_url: next }),
    onSuccess: () => {
      invalidate(auction.id);
      setUrl("");
      toast.success("Cover image updated.");
    },
    onError: (error) => setUrlError(errorMessage(error)),
  });

  const removeMutation = useMutation({
    mutationFn: () => deleteAuctionImage(auction.id),
    onSuccess: () => {
      invalidate(auction.id);
      toast.success("Cover image removed.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function submitUrl() {
    const trimmed = url.trim();
    if (!trimmed) {
      setUrlError("Paste an image address first");
      return;
    }
    // Checked here so a typo comes back inline rather than as a 422.
    if (!IMAGE_URL_RE.test(trimmed)) {
      setUrlError("The address must start with http:// or https://");
      return;
    }
    setUrlError(null);
    setUrlMutation.mutate(trimmed);
  }

  return (
    <Panel
      title="Cover image"
      description="Shown on the auction card in the bidder app."
      actions={
        auction.image_url ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger-ink"
            onClick={() => setConfirmRemove(true)}
          >
            Remove
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          {auction.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={auction.image_url}
              alt=""
              className="h-24 w-32 shrink-0 rounded border border-border object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="flex h-24 w-32 shrink-0 items-center justify-center rounded border border-dashed border-border-strong bg-surface-sunken text-xs text-text-muted"
            >
              none
            </div>
          )}

          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <span
                aria-hidden
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  state === "none" ? "bg-text-muted" : "bg-success",
                )}
              />
              {meta.label}
            </p>
            <p className="mt-0.5 text-xs text-text-muted">{meta.detail}</p>
            {state === "external" && (
              <p className="mt-1 truncate font-mono text-xs text-text-muted">
                {auction.image_url}
              </p>
            )}
          </div>
        </div>

        <UploadProgress uploads={uploads} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              if (event.dataTransfer.files.length > 0) {
                void upload([event.dataTransfer.files[0]]);
              }
            }}
            className={cn(
              "rounded border border-dashed px-3 py-3 text-center text-sm",
              dragOver
                ? "border-accent bg-info-tint text-accent-strong"
                : "border-border-strong text-text-muted",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(",")}
              className="hidden"
              onChange={(event) => {
                if (event.target.files?.[0]) {
                  void upload([event.target.files[0]]);
                }
                event.target.value = "";
              }}
            />
            <p className="font-medium text-text">
              {auction.image_url ? "Replace with a file" : "Upload a file"}
            </p>
            <p className="mt-0.5 text-xs">Drop it here, or</p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-1.5"
              loading={busy}
              onClick={() => inputRef.current?.click()}
            >
              Choose a file
            </Button>
            <p className="mt-1 text-xs">JPEG, PNG or WebP · up to 10 MB</p>
          </div>

          <div className="rounded border border-border px-3 py-3">
            <p className="text-sm font-medium">
              {auction.image_url ? "Replace with a URL" : "Use a URL"}
            </p>
            <p className="mt-0.5 mb-2 text-xs text-text-muted">
              Point at a photo that is already hosted somewhere.
            </p>
            <Field label="Image address" htmlFor="auction-image-url" error={urlError}>
              <Input
                id="auction-image-url"
                type="url"
                inputMode="url"
                placeholder="https://example.com/photo.jpg"
                value={url}
                invalid={Boolean(urlError)}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setUrlError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitUrl();
                  }
                }}
              />
            </Field>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              loading={setUrlMutation.isPending}
              onClick={submitUrl}
            >
              Use this URL
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remove the cover image"
        tone="warning"
        confirmLabel="Remove the image"
        description={
          <div className="flex flex-col gap-2">
            <p>
              The auction card in the bidder app will show no photo until you set
              another one.
            </p>
            {state === "uploaded" && (
              <p>The uploaded file is deleted from storage.</p>
            )}
            <p>Nothing about the auction or its lots changes.</p>
          </div>
        }
        onConfirm={() => removeMutation.mutateAsync()}
      />
    </Panel>
  );
}
