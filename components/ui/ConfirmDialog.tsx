"use client";

import { useState, type ReactNode } from "react";
import { errorMessage } from "@/lib/api/errors";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Field } from "./Field";
import { Input, Textarea } from "./Input";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Plain statement of what happens, including the effect on bidders. */
  description: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "warning" | "neutral";
  /** When set, the operator must type this exact value to enable confirm. */
  requireTypedValue?: string | null;
  typedValueLabel?: string;
  /** When true, a reason is required and is never prefilled. */
  requireReason?: boolean;
  reasonLabel?: string;
  reasonHint?: string;
  onConfirm: (input: { reason: string }) => Promise<unknown> | unknown;
}

/**
 * The only way a destructive action happens in this app. Nothing here is
 * pre-filled: the reason is the operator's words, and type-to-confirm is a
 * literal match.
 */
function normalise(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  tone = "danger",
  requireTypedValue = null,
  typedValueLabel,
  requireReason = false,
  reasonLabel = "Reason",
  reasonHint = "Recorded against this action. Bidders may be told an item was withdrawn, not what you typed here.",
  onConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear on each open, reconciled during render so nothing leaks between uses.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTyped("");
      setReason("");
      setError(null);
      setBusy(false);
    }
  }

  // Compared whitespace-insensitively: Intl formats money with a narrow
  // no-break space, which an operator cannot type. The point of this field is
  // deliberate friction, not reproducing an exotic character.
  const typedOk =
    !requireTypedValue || normalise(typed) === normalise(requireTypedValue);
  const reasonOk = !requireReason || reason.trim().length > 0;
  const canConfirm = typedOk && reasonOk && !busy;

  async function handleConfirm() {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ reason: reason.trim() });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      tone={tone}
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={handleConfirm}
            disabled={!canConfirm}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-sm text-text">{description}</div>

        {requireReason && (
          <Field label={reasonLabel} hint={reasonHint} required>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why are you doing this?"
              maxLength={500}
              autoFocus={!requireTypedValue}
            />
          </Field>
        )}

        {requireTypedValue && (
          <Field
            label={typedValueLabel ?? `Type "${requireTypedValue}" to confirm`}
            required
            error={
              typed.length > 0 && !typedOk
                ? "That does not match — spacing is ignored, the digits are not"
                : undefined
            }
          >
            <Input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={requireTypedValue}
            />
          </Field>
        )}

        {error && (
          <p
            role="alert"
            className="rounded border border-danger bg-danger-tint px-2 py-1.5 text-sm text-danger-ink"
          >
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
