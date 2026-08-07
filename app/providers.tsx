"use client";

import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster, toast } from "sonner";
import { ApiError } from "@/lib/api/errors";
import { restoreSession, useSessionStore } from "@/lib/auth";

/** Errors the user caused or that a retry cannot fix. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.status === 429) return false;
    if (error.status >= 400 && error.status < 500) return false;
  }
  return failureCount < 2;
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        // Operators leave this open for hours; stale money numbers are worse
        // than an extra request.
        refetchOnReconnect: true,
      },
      mutations: { retry: false },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Background refetch failures are otherwise invisible.
        if (query.state.data !== undefined && error instanceof ApiError) {
          toast.error(`Could not refresh: ${error.detail}`);
        }
      },
    }),
  });
}

function SessionBootstrap() {
  const status = useSessionStore((s) => s.status);
  useEffect(() => {
    if (status === "loading") void restoreSession();
  }, [status]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionBootstrap />
      {children}
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{ duration: 6000 }}
      />
    </QueryClientProvider>
  );
}
