"use client";

import { useEffect } from "react";

const SUFFIX = "Consignment Warehouse Admin";

/**
 * Real titles for client-rendered detail screens. Static routes get their
 * titles from a `layout.tsx` metadata export; these ones only know what they
 * are once the data has loaded.
 */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · ${SUFFIX}`;
  }, [title]);
}
