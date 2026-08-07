"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Note } from "@/components/ui/Feedback";
import { isAdminRole, signOut, useSessionStore } from "@/lib/auth";

/**
 * A bidder who signs in here gets told plainly, rather than being dropped into
 * a console where every request 403s.
 */
export default function NoAccessPage() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const status = useSessionStore((s) => s.status);

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
    if (status === "authenticated" && user && isAdminRole(user.role)) {
      router.replace("/auctions");
    }
  }, [status, user, router]);

  return (
    <AuthShell title="No admin access" subtitle="Consignment Warehouse admin console">
      <Note tone="warning">
        This account does not have admin access. Signing in worked, but the
        operator console is only available to admin and superadmin accounts.
      </Note>
      <p className="text-sm text-text-muted">
        If you should have access, ask a superadmin to promote your account,
        then sign in again.
      </p>
      <Button
        variant="primary"
        onClick={async () => {
          await signOut();
          router.replace("/login");
        }}
      >
        Sign out
      </Button>
    </AuthShell>
  );
}
