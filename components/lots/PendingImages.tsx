"use client";

import { useRef, useState } from "react";
import { validateImageFile } from "@/lib/api/upload";
import { cn, randomUuid } from "@/lib/utils";
import { ALLOWED_IMAGE_TYPES } from "@/types/api";

/**
 * A photo chosen but not yet uploaded. `url` is an object URL for the preview
 * and MUST be revoked when the image is dropped or the form resets — twenty
 * lots of held previews is a real leak on a warehouse laptop.
 */
export interface PendingImage {
  id: string;
  file: File;
  url: string;
  isPrimary: boolean;
}

export function makePendingImage(file: File): PendingImage {
  return {
    id: randomUuid(),
    file,
    url: URL.createObjectURL(file),
    isPrimary: false,
  };
}

/** Drop every preview held by these images. Safe to call twice. */
export function revokePendingImages(images: PendingImage[]) {
  for (const image of images) URL.revokeObjectURL(image.url);
}

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

/**
 * Photos held on the create form, before the lot they belong to exists.
 *
 * Presign is scoped to a lot, so nothing can be uploaded until there is one —
 * the same constraint the auction create form works around. Order and primary
 * are decided here, while the operator is looking at the pile of photographs,
 * and applied after the lot is created.
 *
 * Deliberately mirrors the real gallery: same dropzone wording, same controls
 * below the photo rather than overlaid on it, same 44px targets, so the two do
 * not feel like different features.
 */
export function PendingImages({
  images,
  onChange,
  disabled = false,
}: {
  images: PendingImage[];
  onChange: (next: PendingImage[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);

  // Same rule the gallery and the bidder app apply: with nothing flagged, the
  // first photo is the primary one.
  const effectivePrimaryId =
    images.find((image) => image.isPrimary)?.id ?? images[0]?.id ?? null;

  function add(files: FileList | File[]) {
    const accepted: PendingImage[] = [];
    const refused: string[] = [];
    for (const file of Array.from(files)) {
      // Checked now rather than at upload: the point of holding files is that
      // the operator finds out here, not after the lot is created.
      // The message already names the file — do not prefix it again.
      const invalid = validateImageFile(file);
      if (invalid) refused.push(invalid);
      else accepted.push(makePendingImage(file));
    }
    setRejected(refused);
    if (accepted.length > 0) onChange([...images, ...accepted]);
  }

  function remove(image: PendingImage) {
    URL.revokeObjectURL(image.url);
    onChange(images.filter((item) => item.id !== image.id));
  }

  function makePrimary(image: PendingImage) {
    onChange(
      images.map((item) => ({ ...item, isPrimary: item.id === image.id })),
    );
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = images.findIndex((image) => image.id === dragId);
    const to = images.findIndex((image) => image.id === targetId);
    setDragId(null);
    if (from < 0 || to < 0) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  return (
    <fieldset className="flex flex-col gap-2 rounded border border-border px-3 py-2">
      <legend className="px-1 text-xs font-medium">
        Photos{images.length > 0 ? ` (${images.length})` : ""}
      </legend>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          if (event.target.files) add(event.target.files);
          event.target.value = "";
        }}
      />

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!dragId) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (event.dataTransfer.files.length > 0) add(event.dataTransfer.files);
        }}
        className={cn(
          "rounded border border-dashed px-3 py-3 text-center text-sm",
          dragOver
            ? "border-accent bg-info-tint text-accent-strong"
            : "border-border-strong text-text-muted",
        )}
      >
        Drop photos here, or{" "}
        <button
          type="button"
          disabled={disabled}
          className="font-medium text-accent-strong underline disabled:no-underline disabled:opacity-60"
          onClick={() => inputRef.current?.click()}
        >
          choose files
        </button>
        <p className="mt-1 text-xs">
          JPEG, PNG or WebP · up to 10 MB each · uploaded once the lot is created
        </p>
      </div>

      {rejected.length > 0 && (
        <ul
          role="alert"
          className="rounded border border-danger bg-danger-tint px-2 py-1.5 text-xs text-danger-ink"
        >
          {rejected.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      {images.length > 0 && (
        <>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((image) => {
              const isPrimary = image.id === effectivePrimaryId;
              return (
                <li
                  key={image.id}
                  draggable={!disabled}
                  onDragStart={() => setDragId(image.id)}
                  onDragEnd={() => setDragId(null)}
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
                    dragId === image.id && "opacity-40",
                  )}
                >
                  <div className="relative cursor-grab">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt=""
                      className="aspect-square w-full object-cover"
                    />
                    {isPrimary && (
                      <span className="absolute top-1 left-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-ink">
                        Primary
                      </span>
                    )}
                  </div>

                  {/* Below the photo and always visible, as in the gallery. */}
                  <div
                    draggable={false}
                    onDragStart={(event) => event.stopPropagation()}
                    className="flex items-stretch border-t border-border"
                  >
                    {isPrimary ? (
                      <span className="flex min-h-11 flex-1 items-center justify-center px-1 text-[11px] font-medium text-accent-strong">
                        Primary
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => makePrimary(image)}
                        title="Show this photo to bidders first"
                        className="flex min-h-11 flex-1 items-center justify-center px-1 text-[11px] font-medium text-text hover:bg-surface-sunken disabled:opacity-60"
                      >
                        Make primary
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => remove(image)}
                      aria-label={`Remove ${image.file.name}`}
                      title="Remove this photo"
                      className="flex min-h-11 w-11 shrink-0 items-center justify-center border-l border-border text-danger-ink hover:bg-danger-tint disabled:opacity-60"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-text-muted">
            Drag a thumbnail onto another to reorder. Nothing is uploaded until
            you add the lot.
          </p>
        </>
      )}
    </fieldset>
  );
}
