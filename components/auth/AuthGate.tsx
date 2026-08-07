"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import { isAdminRole, useSessionStore } from "@/lib/auth";

/**
 * Guards every console route. Preserves the intended destination so an
 * operator who deep-links into a lot lands back on it after signing in.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const status = useSessionStore((s) => s.status);
  const user = useSessionStore((s) => s.user);

  useEffect(() => {
    if (status !== "anonymous") return;
    const query = search.toString();
    const next = `${pathname}${query ? `?${query}` : ""}`;
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [status, pathname, search, router]);

  useEffect(() => {
    if (status === "authenticated" && user && !isAdminRole(user.role)) {
      router.replace("/no-access");
    }
  }, [status, user, router]);

  if (status !== "authenticated" || !user || !isAdminRole(user.role)) {
    return <BootSkeleton />;
  }

  return <>{children}</>;
}

function BootSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex h-12 items-center gap-3 border-b border-border bg-surface px-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="ml-auto h-5 w-20" />
      </div>
      <div className="flex flex-1">
        <div className="hidden w-56 flex-col gap-2 border-r border-border bg-surface p-2 md:flex">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
        <div className="flex-1 space-y-3 p-5">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}
