"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { ErrorState, Note, Skeleton } from "@/components/ui/Feedback";
import { Select, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataPoint, Panel } from "@/components/ui/Panel";
import { RoleBadge, StatusBadge } from "@/components/ui/StatusBadge";
import { Tabs } from "@/components/ui/Tabs";
import {
  changeUserRole,
  reactivateUser,
  suspendUser,
} from "@/lib/api/endpoints";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { useUser, useUserDeposit, useUserLedger } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { formatDateTime, formatRelative } from "@/lib/format/datetime";
import { describeHeld } from "@/lib/format/deposits";
import { describeBalance } from "@/lib/format/ledger";
import { USER_ROLE_META } from "@/lib/format/status";
import { isSuperadmin, useSessionStore } from "@/lib/auth";
import { usePageTitle } from "@/lib/ui/use-page-title";
import { userRoleSchema, type UserRole } from "@/types/api";
import { UserInvoices } from "@/components/invoices/UserInvoices";
import { UserDeposit } from "./UserDeposit";
import { UserLedgerAccount, UserStatement } from "./UserLedger";

/**
 * **Account is the default tab and carries no `?tab=`**, matching the auction
 * screen's convention so a pasted link is the shortest thing that works.
 *
 * Order is the order the questions arrive in: what do they owe and what are we
 * doing about it, then the deposit book, then the long history, then who they
 * are. The two figures those first two tabs are *about* stay in the header, so
 * nothing that decides anything is behind a click.
 */
const TABS = [
  { id: "account", label: "Account" },
  { id: "deposit", label: "Deposit" },
  { id: "statement", label: "Statement" },
  { id: "details", label: "Details" },
];

export function UserDetail({ userId }: { userId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("tab");
  // An unknown `?tab=` falls back rather than rendering nothing: a stale
  // bookmark should land somewhere useful, not on a blank screen.
  const tab = TABS.some((t) => t.id === requested) ? requested! : "account";

  function setTab(next: string) {
    router.replace(`/users/${userId}${next === "account" ? "" : `?tab=${next}`}`);
  }
  const client = useQueryClient();
  const { data: user, isPending, error, refetch } = useUser(userId);
  // The two figures in the header. Page 0 of each book, which is the same query
  // key the Deposit and Account tabs ask for — so this adds no request, and
  // their mutations already invalidate by prefix.
  const deposit = useUserDeposit(userId);
  const ledger = useUserLedger(userId);
  const held = describeHeld(
    deposit.data?.statement?.held_minor ?? 0,
    deposit.data?.statement?.currency_code ?? "ZAR",
  );
  const standing = describeBalance(
    ledger.data?.statement?.balance_minor ?? 0,
    ledger.data?.statement?.currency_code ?? "ZAR",
  );
  const me = useSessionStore((s) => s.user);
  usePageTitle(
    user
      ? [user.first_name, user.last_name].filter(Boolean).join(" ") || "User"
      : null,
  );

  const [showSuspend, setShowSuspend] = useState(false);
  const [showReactivate, setShowReactivate] = useState(false);
  const [showRole, setShowRole] = useState(false);

  const isSelf = me?.id === userId;
  const canChangeRoles = isSuperadmin(me?.role);

  function invalidate() {
    void client.invalidateQueries({ queryKey: queryKeys.user(userId) });
    void client.invalidateQueries({ queryKey: ["users"] });
  }

  /**
   * The backend's 409 guards already name the exact reason ("an admin cannot
   * change their own role", "the last active superadmin cannot be suspended"),
   * so they are passed through rather than padded with a generic restatement.
   */
  function explain(err: unknown): string {
    if (isApiError(err) && err.status === 403) {
      return "Only a superadmin can change roles.";
    }
    return errorMessage(err);
  }

  const suspend = useMutation({
    mutationFn: (reason: string) => suspendUser(userId, reason),
    onSuccess: () => {
      invalidate();
      toast.success("Account suspended. Their sessions have been closed.");
    },
    onError: (err) => toast.error(explain(err)),
  });

  const reactivate = useMutation({
    mutationFn: (reason: string) => reactivateUser(userId, reason),
    onSuccess: () => {
      invalidate();
      toast.success("Account reactivated. They will need to sign in again.");
    },
    onError: (err) => toast.error(explain(err)),
  });

  const changeRole = useMutation({
    mutationFn: ({ role, reason }: { role: UserRole; reason: string }) =>
      changeUserRole(userId, { role, reason }),
    onSuccess: (updated) => {
      invalidate();
      setShowRole(false);
      toast.success(`Role changed to ${updated.role}.`);
    },
    onError: (err) => toast.error(explain(err)),
  });

  if (error) {
    return (
      <ErrorState
        title="Could not load that user"
        message={errorMessage(error)}
        onRetry={() => void refetch()}
      />
    );
  }

  if (isPending || !user) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const name =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || "No name given";

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Users", href: "/users" }, { label: name }]}
        title={
          <span className="flex items-center gap-2">
            {name}
            <StatusBadge status={user.status} kind="user" />
            <RoleBadge role={user.role} />
          </span>
        }
        subtitle={
          <span className="tnum font-mono text-xs">{user.phone_e164}</span>
        }
        actions={
          <>
            {canChangeRoles && !isSelf && (
              <Button variant="secondary" onClick={() => setShowRole(true)}>
                Change role
              </Button>
            )}
            {user.status === "active" ? (
              <Button
                variant="danger"
                disabled={isSelf}
                title={isSelf ? "You cannot suspend yourself" : undefined}
                onClick={() => setShowSuspend(true)}
              >
                Suspend
              </Button>
            ) : user.status === "suspended" ? (
              <Button variant="primary" onClick={() => setShowReactivate(true)}>
                Reactivate
              </Button>
            ) : null}
          </>
        }
      />

      {user.status === "deleted" && (
        <Note tone="warning" className="mb-3">
          This account was closed by the user. It cannot be reactivated — the backend refuses it,
          so there is no control here rather than one that fails. Their name, contact details and
          saved addresses are gone; their bids and ledger entries remain, because those are
          financial records, and their payment reference is kept so a historical bank line can
          still be matched.
        </Note>
      )}

      {isSelf && (
        <Note tone="info" className="mb-3">
          This is your own account. The backend refuses self-suspension and
          self-role-changes, so those controls are off.
        </Note>
      )}

      {!canChangeRoles && (
        <Note tone="info" className="mb-3">
          Role changes are superadmin-only. You are signed in as{" "}
          {me?.role ?? "an admin"}, so that control is hidden rather than left
          there to fail.
        </Note>
      )}

      {/* Six figures, always visible, money first — and the money being here
          rather than inside a tab is the whole reason this screen can have tabs
          at all. "Why can this person not bid" is the question an operator
          arrives with, the deposit is the only answer, and a number that needs
          a click is a number that gets guessed at instead. The balance sits
          beside it for the opposite reason: the two are separate books and
          reading either one alone draws the wrong conclusion.

          Both come from the same query keys the Deposit and Account tabs use
          (page 0), so TanStack serves one request for each however many of them
          are mounted — and the panels' mutations invalidate by prefix, so
          recording money updates these without any wiring here. */}
      <Panel
        className="mb-3"
        bodyClassName="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <DataPoint label="Deposit held">
          {deposit.isPending ? (
            <Skeleton className="h-7 w-28" />
          ) : (
            <span
              className={cn(
                "tnum text-lg font-semibold",
                held.tone === "none" && "text-text-muted",
              )}
            >
              {held.text}
            </span>
          )}
        </DataPoint>
        <DataPoint label="Balance">
          {ledger.isPending ? (
            <Skeleton className="h-7 w-28" />
          ) : (
            <span
              className={cn(
                "tnum text-lg font-semibold",
                standing.tone === "owing" && "text-danger-ink",
                standing.tone === "credit" && "text-success-ink",
              )}
            >
              {standing.text}
            </span>
          )}
        </DataPoint>
        <DataPoint label="Bids placed">
          <span className="tnum text-lg font-semibold">{user.bid_count}</span>
        </DataPoint>
        <DataPoint label="Lots bid on">
          <span className="tnum text-lg font-semibold">{user.lots_bid_on}</span>
        </DataPoint>
        <DataPoint label="Currently winning">
          <span className="tnum text-lg font-semibold">
            {user.lots_currently_winning}
          </span>
        </DataPoint>
        <DataPoint label="Active sessions">
          <span className="tnum text-lg font-semibold">
            {user.active_sessions}
          </span>
        </DataPoint>
      </Panel>

      {/* Tabs from here down, the same component and the same URL convention as
          the auction screen: the default tab carries no `?tab=`, so an operator
          can paste a link straight to someone's statement.

          Switching tabs UNMOUNTS the panel, which is why the two figures above
          have their own queries rather than reading one off a mounted child. */}
      <Tabs tabs={TABS} active={tab} onChange={setTab} className="mb-3" />

      {tab === "account" && (
        <div className="flex flex-col gap-4">
          {/* Record money and the invoice list stay together: an allocation
              rides on the same POST as the payment, so splitting them would put
              half an operation on another tab. */}
          <UserLedgerAccount
            userId={userId}
            paymentReference={user.payment_reference}
          />
          <UserInvoices userId={userId} />
        </div>
      )}

      {tab === "deposit" && (
        <UserDeposit userId={userId} paymentReference={user.payment_reference} />
      )}

      {tab === "statement" && <UserStatement userId={userId} />}

      {tab === "details" && (
        <Panel title="Details">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-text-muted">Phone</dt>
              <dd className="tnum font-mono text-sm">{user.phone_e164}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Email</dt>
              <dd className="text-sm">
                {user.email ? (
                  <>
                    <span className="break-all">{user.email}</span>
                    <EmailDelivery user={user} />
                  </>
                ) : (
                  <span className="text-text-muted">
                    none — SMS only
                  </span>
                )}
              </dd>
            </div>
            <div>
              {/* Free text and never validated — a passport number is a legitimate
                  answer, and a uniqueness rule on something a bidder types would
                  turn one person's typo into another's lockout. It is here because
                  the invoice design prints it; nothing gates on it. */}
              <dt className="text-xs text-text-muted">ID / passport number</dt>
              <dd className="font-mono text-sm">
                {user.id_number ?? (
                  <span className="font-sans text-text-muted">not given</span>
                )}
              </dd>
            </div>
            <div>
              {/* What the operator quotes when this person asks how to pay money
                  ONTO their account. An invoice asks for its own number instead. */}
              <dt className="text-xs text-text-muted">Payment reference</dt>
              <dd className="font-mono text-sm">
                {user.payment_reference ?? (
                  <span className="font-sans text-text-muted">
                    none — issued when they first owe money
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Phone verified</dt>
              <dd className="text-sm">{user.is_phone_verified ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Last login</dt>
              <dd className="tnum text-sm">
                {user.last_login_at
                  ? `${formatDateTime(user.last_login_at)} (${formatRelative(user.last_login_at)})`
                  : "never"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Joined</dt>
              <dd className="tnum text-sm">{formatDateTime(user.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">User ID</dt>
              <dd className="font-mono text-xs">{user.id}</dd>
            </div>
          </dl>
        </Panel>
      )}

      <ConfirmDialog
        open={showSuspend}
        onClose={() => setShowSuspend(false)}
        title={`Suspend ${name}`}
        tone="danger"
        confirmLabel="Suspend the account"
        requireReason
        reasonHint="Required by the backend and recorded against the suspension."
        description={
          <div className="flex flex-col gap-2">
            <p>
              They will not be able to sign in. Every refresh token is revoked
              and their {user.active_sessions} live{" "}
              {user.active_sessions === 1
                ? "session closes"
                : "sessions close"}{" "}
              immediately, including any open bidding screen.
            </p>
            <p>
              <strong>Their existing bids stand.</strong> Bids are financial
              records, not privileges — suspending does not remove them, and a
              lot they are leading stays led by them.
            </p>
            <p className="text-xs text-text-muted">
              The backend refuses this if it would suspend you, or the last
              active superadmin.
            </p>
          </div>
        }
        onConfirm={({ reason }) => suspend.mutateAsync(reason)}
      />

      <ConfirmDialog
        open={showReactivate}
        onClose={() => setShowReactivate(false)}
        title={`Reactivate ${name}`}
        tone="neutral"
        confirmLabel="Reactivate the account"
        requireReason
        reasonHint="Required by the backend and recorded against the reactivation."
        description={
          <div className="flex flex-col gap-2">
            <p>They will be able to sign in again.</p>
            <p>
              Their old sessions are <strong>not</strong> restored — they sign in
              fresh with a new code.
            </p>
          </div>
        }
        onConfirm={({ reason }) => reactivate.mutateAsync(reason)}
      />

      {canChangeRoles && (
        <ChangeRoleDialog
          open={showRole}
          onClose={() => setShowRole(false)}
          currentRole={user.role}
          name={name}
          busy={changeRole.isPending}
          onSubmit={(role, reason) => changeRole.mutate({ role, reason })}
        />
      )}
    </>
  );
}

function ChangeRoleDialog({
  open,
  onClose,
  currentRole,
  name,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  currentRole: UserRole;
  name: string;
  busy: boolean;
  onSubmit: (role: UserRole, reason: string) => void;
}) {
  const [role, setRole] = useState<UserRole>(currentRole);
  const [reason, setReason] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRole(currentRole);
      setReason("");
    }
  }

  const changed = role !== currentRole;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Change role for ${name}`}
      description="Only a superadmin can do this."
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!changed || reason.trim().length === 0 || busy}
            loading={busy}
            onClick={() => onSubmit(role, reason.trim())}
          >
            Change role
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="New role" required>
          <Select
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
          >
            {userRoleSchema.options.map((value) => (
              <option key={value} value={value}>
                {USER_ROLE_META[value].label}
              </option>
            ))}
          </Select>
        </Field>

        {role === "superadmin" && (
          <Note tone="warning">
            A superadmin can change anyone&apos;s role, including yours.
          </Note>
        )}
        {currentRole === "superadmin" && role !== "superadmin" && (
          <Note tone="warning">
            Demoting a superadmin is refused if they are the last active one.
          </Note>
        )}

        <Field
          label="Reason"
          required
          hint="Required by the backend and recorded against the change."
        >
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            placeholder="Why is this role changing?"
          />
        </Field>
      </div>
    </Dialog>
  );
}

/**
 * Whether email actually reaches this person.
 *
 * This exists for one question an operator otherwise cannot answer: "I never got
 * the notification." Unverified addresses are never routed to, so nothing was
 * ever sent to them; a verified address that later hard-bounced is failing
 * silently, and the person needs to be told to correct it. Bounced therefore
 * reads as a problem rather than as another neutral timestamp.
 *
 * There is deliberately no control to verify an address from here. Verification
 * means the person proving they control the mailbox — an operator ticking it off
 * on their behalf would defeat the point and could put someone's auction mail
 * into a stranger's inbox.
 */
function EmailDelivery({
  user,
}: {
  user: { email_verified_at: string | null; email_bounced_at: string | null };
}) {
  // Bounced wins over verified: a bounced address has usually been verified too,
  // and the failure is the part that needs acting on.
  if (user.email_bounced_at) {
    return (
      <span className="mt-1 flex flex-col gap-0.5 rounded border border-danger-tint-border bg-danger-tint px-1.5 py-1 text-xs text-danger-ink">
        <span className="font-semibold">
          Bouncing — email is not arriving
        </span>
        <span>
          Mail to this address failed on{" "}
          {formatDateTime(user.email_bounced_at)}. Ask them for a corrected
          address; they can only verify it themselves.
        </span>
      </span>
    );
  }

  if (user.email_verified_at) {
    return (
      <span className="mt-0.5 block text-xs text-success-ink">
        Verified {formatDateTime(user.email_verified_at)}
      </span>
    );
  }

  return (
    <span className="mt-0.5 block text-xs text-warning-ink">
      Not verified — nothing is sent to this address
    </span>
  );
}
