"use client";

import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster, toast } from "sonner";
import { ApiError } from "@/lib/api/errors";
import { restoreSession, useSessionStore } from "@/lib/auth";
import { THEME_STORAGE_KEY } from "@/lib/ui/theme";

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

/** Sonner paints its own surfaces, so it needs telling which theme is active. */
function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      toastOptions={{ duration: 6000 }}
    />
  );
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
    /*
     * Theme sits outside the query client because it must be applied before
     * first paint, not after data loads.
     *
     * `defaultTheme="light"` keeps the existing look out of the box — System is
     * opt-in, not the default. `attribute="data-theme"` matches the selector in
     * globals.css. next-themes also writes `color-scheme` onto <html>, which is
     * what makes native date pickers, scrollbars and autofill follow the theme;
     * DateTimeInput and MoneyInput lean on those constantly.
     */
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="light"
      enableSystem
      storageKey={THEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <SessionBootstrap />
        {children}
        <ThemedToaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
