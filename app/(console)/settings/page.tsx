"use client";

import { DemoLogins } from "@/components/settings/DemoLogins";
import { EmptyState } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { useCurrentRole } from "@/lib/api/queries";
import { isSuperadmin } from "@/lib/auth";

/**
 * Settings.
 *
 * **Everything here is superadmin-only today, so the whole page is gated and
 * the sidebar hides it for an ordinary admin.** When a section an ordinary
 * admin should see is added, the gate moves from this page down to the demo
 * sign-ins section and the nav item stops being conditional — the arrangement
 * below is the smaller of the two, not a claim that settings are inherently
 * privileged.
 *
 * The page still renders a refusal rather than redirecting, because an admin who
 * followed a link from a superadmin deserves an answer. `AuthGate` only checks
 * admin-or-superadmin, and the backend refuses the calls regardless.
 */
export default function SettingsPage() {
  const role = useCurrentRole();

  if (!isSuperadmin(role)) {
    return (
      <>
        <PageHeader title="Settings" />
        <EmptyState
          title="Not available on your account"
          description="Everything on this screen is restricted to superadmins. Ask one to make the change for you."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Platform-level settings. Restricted to superadmins."
      />
      <DemoLogins />
    </>
  );
}
