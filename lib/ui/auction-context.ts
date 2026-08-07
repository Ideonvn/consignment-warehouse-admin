/**
 * Which auction the operator is currently working inside. The top bar shows it
 * and the sidebar's Lots entry points at it; pages set it as they mount.
 */
import { useEffect } from "react";
import { create } from "zustand";
import type { AuctionAdmin } from "@/types/api";

interface AuctionContextState {
  auction: Pick<AuctionAdmin, "id" | "name" | "slug" | "status"> | null;
  set: (auction: AuctionContextState["auction"]) => void;
}

export const useAuctionContextStore = create<AuctionContextState>((set) => ({
  auction: null,
  set: (auction) => set({ auction }),
}));

/** Publishes the auction context for as long as the calling screen is mounted. */
export function useSetAuctionContext(
  auction: Pick<AuctionAdmin, "id" | "name" | "slug" | "status"> | null | undefined,
) {
  const set = useAuctionContextStore((s) => s.set);
  const id = auction?.id;
  const name = auction?.name;
  const slug = auction?.slug;
  const status = auction?.status;

  useEffect(() => {
    if (!id || !name || !slug || !status) return;
    set({ id, name, slug, status });
    return () => set(null);
  }, [id, name, slug, status, set]);
}
