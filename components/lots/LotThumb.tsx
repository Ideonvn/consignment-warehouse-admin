"use client";

import { useQueries } from "@tanstack/react-query";
import { listLotImages } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/query-keys";
import { cn } from "@/lib/utils";

/**
 * LotAdminSummaryOut carries no image, so thumbnails are fetched per lot.
 * Capped so a 200-lot auction does not fire 200 requests; recorded in NOTES.md
 * as a backend request for `primary_image_url` on the summary shape.
 */
const THUMBNAIL_FETCH_LIMIT = 60;

export function useLotThumbnails(lotIds: string[]): Map<string, string | null> {
  const ids = lotIds.slice(0, THUMBNAIL_FETCH_LIMIT);
  return useQueries({
    queries: ids.map((lotId) => ({
      queryKey: queryKeys.lotImages(lotId),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        listLotImages(lotId, signal),
      staleTime: 5 * 60_000,
    })),
    combine: (results) => {
      const map = new Map<string, string | null>();
      ids.forEach((lotId, index) => {
        const images = results[index]?.data;
        if (!images) {
          map.set(lotId, null);
          return;
        }
        // Exactly one image is primary; if none is flagged the bidder app
        // treats the lowest position as primary, so mirror that here.
        const primary =
          images.find((image) => image.is_primary) ??
          [...images].sort((a, b) => a.position - b.position)[0];
        map.set(lotId, primary?.url ?? null);
      });
      return map;
    },
  });
}

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
