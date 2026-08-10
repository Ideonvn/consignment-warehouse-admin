"use client";

import { cn } from "@/lib/utils";

export function LotThumb({
  url,
  alt,
  className,
}: {
  url: string | null | undefined;
  alt: string;
  className?: string;
}) {
  if (!url) {
    return (
      <div
        aria-hidden
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded border border-border bg-surface-sunken text-[9px] text-text-muted",
          className,
        )}
      >
        no img
      </div>
    );
  }
  // next/image is not used here: images come from an object store whose host
  // is not known at build time, so remotePatterns cannot be configured for it.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={cn(
        "h-8 w-8 rounded border border-border object-cover",
        className,
      )}
    />
  );
}
