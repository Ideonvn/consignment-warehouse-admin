"use client";

import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-5">
          <p className="text-xs font-semibold tracking-widest text-text-muted uppercase">
            Consignment Warehouse
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
          )}
        </div>
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
          {children}
        </div>
      </div>
    </main>
  );
}
