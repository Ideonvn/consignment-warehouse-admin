"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, Note, Skeleton } from "@/components/ui/Feedback";
import { Field, useFieldId } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Panel";
import * as api from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/errors";
import { useDemoLogins } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { PhoneField } from "@/lib/auth/PhoneField";
import { formatDateTime, formatRelative } from "@/lib/format/datetime";
import type { DemoLoginAdmin } from "@/types/api";
import { demoCodeProblem, generateDemoCode } from "./demo-code";

/**
 * Demo sign-ins — the app store review credential.
 *
 * Phone OTP is the only way into this product, so a reviewer cannot sign in at
 * all: they have no handset on our numbers. A demo sign-in gives one number a
 * fixed code and no SMS; everything else about the login is the ordinary flow.
 *
 * **The code cannot be read back.** The backend stores a one-way hash, so the
 * reveal in the create dialog is the only time it is ever visible. That is why
 * the portal generates it rather than asking an operator to think one up — a
 * typed code is both likelier to be a pattern and likelier to be mis-copied,
 * and there is no second chance to check.
 */
export function DemoLogins() {
  const { data, isPending, error, refetch } = useDemoLogins();
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<DemoLoginAdmin | null>(null);

  const rows = data ?? [];

  return (
    <>
      <Panel
        title="Demo sign-ins"
        description="A fixed login code for one number, so an app store reviewer can get in without receiving an SMS."
        actions={
          <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
            New demo sign-in
          </Button>
        }
      >
        {error ? (
          <ErrorState
            message={errorMessage(error)}
            onRetry={() => void refetch()}
          />
        ) : isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No demo sign-ins"
            description="Create one before submitting a build for review, and put the code in App Store Connect."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="px-2 py-1.5 text-left text-xs font-semibold text-text-muted">
                    Number
                  </th>
                  <th className="px-2 py-1.5 text-left text-xs font-semibold text-text-muted">
                    Note
                  </th>
                  <th className="px-2 py-1.5 text-left text-xs font-semibold text-text-muted">
                    Last used
                  </th>
                  <th className="px-2 py-1.5 text-left text-xs font-semibold text-text-muted">
                    Created
                  </th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="tnum px-2 py-1.5 font-mono text-xs">
                      {row.phone_e164}
                    </td>
                    <td className="px-2 py-1.5">
                      {row.note ?? (
                        <span className="text-text-muted">none</span>
                      )}
                    </td>
                    <td
                      className="px-2 py-1.5 text-xs text-text-muted"
                      title={
                        row.last_used_at
                          ? formatDateTime(row.last_used_at)
                          : undefined
                      }
                    >
                      {row.last_used_at ? (
                        formatRelative(row.last_used_at)
                      ) : (
                        // Worth saying rather than leaving blank: an unused row
                        // is the one that can be removed with confidence.
                        <span className="text-text-muted">never</span>
                      )}
                    </td>
                    <td
                      className="px-2 py-1.5 text-xs text-text-muted"
                      title={formatDateTime(row.created_at)}
                    >
                      {formatRelative(row.created_at)}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setRemoving(row)}
                        >
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <CreateDemoLoginDialog
        open={creating}
        onClose={() => setCreating(false)}
      />
      <RemoveDemoLoginDialog
        row={removing}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}

/**
 * Two steps in one dialog: the form, then the reveal.
 *
 * The code is shown on the form as well, because the operator may want it in
 * App Store Connect before pressing anything. The reveal step exists anyway: it
 * is the last point at which the code is on a screen, and saying so where it
 * cannot be missed is the whole reason this feature needs a confirmation at all.
 */
function CreateDemoLoginDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const phoneId = useFieldId("demo-phone");
  const noteId = useFieldId("demo-note");

  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  // Generated once per dialog opening rather than on every render, or every
  // keystroke in the note field would mint a new credential under the operator.
  const [code, setCode] = useState(() => generateDemoCode());
  const [created, setCreated] = useState<DemoLoginAdmin | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.createDemoLogin({
        phone,
        code,
        note: note.trim() || null,
      }),
    onSuccess: (row) => {
      setCreated(row);
      void client.invalidateQueries({ queryKey: queryKeys.demoLogins });
    },
  });

  function close() {
    onClose();
    // Reset after closing so the next opening starts clean, with a NEW code —
    // reusing one across two numbers would make a single leak open two accounts.
    setPhone("");
    setNote("");
    setCode(generateDemoCode());
    setCreated(null);
    create.reset();
  }

  const codeProblem = demoCodeProblem(code);
  const canSubmit = phone.length > 0 && !codeProblem && !create.isPending;

  if (created) {
    return (
      <Dialog
        open={open}
        onClose={close}
        title="Demo sign-in created"
        tone="warning"
        width="sm"
        description="This is the last time the code will be shown."
        footer={
          <Button variant="primary" onClick={close}>
            I have saved it
          </Button>
        }
      >
        <div className="space-y-3">
          <CodeReveal code={code} />
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-text-muted">Number</dt>
              <dd className="tnum font-mono text-xs">{created.phone_e164}</dd>
            </div>
          </dl>
          <Note tone="warning">
            The backend stores the code as a one-way hash, so nothing can read it
            back — not this screen, not the API, not the database. If it is lost,
            remove this demo sign-in and create another.
          </Note>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New demo sign-in"
      width="sm"
      description="One number, one fixed code. Requesting a code for it sends no SMS."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!canSubmit}
            onClick={() => create.mutate()}
          >
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field
          label="Phone number"
          htmlFor={phoneId}
          required
          hint="Use a number nobody can receive SMS on — that is the point, not a limitation."
        >
          <PhoneField id={phoneId} onChange={setPhone} autoFocus />
        </Field>

        <Field
          label="Code"
          hint="Generated here, six digits. Copy it into App Store Connect now."
        >
          <CodeReveal code={code} onRegenerate={() => setCode(generateDemoCode())} />
        </Field>

        <Field
          label="Note"
          htmlFor={noteId}
          hint="Why it exists, for whoever finds this row in six months."
        >
          <Input
            id={noteId}
            value={note}
            maxLength={500}
            placeholder="Apple review"
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        {create.error ? (
          <Note tone="danger">{errorMessage(create.error)}</Note>
        ) : (
          <Note tone="info">
            A number with bidding or financial history is refused — this cannot
            be pointed at a real customer&apos;s account.
          </Note>
        )}
      </div>
    </Dialog>
  );
}

/** The code, large enough to read off a screen and copy by hand if need be. */
function CodeReveal({
  code,
  onRegenerate,
}: {
  code: string;
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The clipboard API is secure-context only, so over plain http on a LAN
      // IP it is simply absent. The code is already on screen in a size that
      // can be read off it, so this is a nudge rather than a failure.
      toast.message("Copy it by hand — the clipboard needs https");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="tnum flex-1 rounded border border-border-strong bg-surface-sunken px-3 py-2 text-center text-xl font-semibold tracking-[0.3em]">
        {code}
      </code>
      <div className="flex flex-col gap-1">
        <Button size="sm" variant="secondary" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
        {onRegenerate && (
          <Button size="sm" variant="ghost" onClick={onRegenerate}>
            New code
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Removing one restores ordinary SMS OTP for that number on the very next
 * request. The account it created is untouched — that is a real account that
 * really signed in, and withdrawing a credential is not deleting somebody.
 */
function RemoveDemoLoginDialog({
  row,
  onClose,
}: {
  row: DemoLoginAdmin | null;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteDemoLogin(id),
    onSuccess: () => {
      toast.success("Demo sign-in removed.");
      void client.invalidateQueries({ queryKey: queryKeys.demoLogins });
      onClose();
    },
  });

  return (
    <Dialog
      open={row !== null}
      onClose={onClose}
      title="Remove this demo sign-in?"
      tone="danger"
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => row && remove.mutate(row.id)}
          >
            Remove
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">
          <span className="tnum font-mono text-xs">{row?.phone_e164}</span> goes
          back to ordinary SMS OTP immediately. Any account it created stays.
        </p>
        <Note tone="warning">
          If a build is in review against this number, review will fail. Check
          before removing.
        </Note>
        {remove.error ? (
          <Note tone="danger">{errorMessage(remove.error)}</Note>
        ) : null}
      </div>
    </Dialog>
  );
}
