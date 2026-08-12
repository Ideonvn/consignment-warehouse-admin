"use client";

import { useState } from "react";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { bpsToPercentString, parsePercentToBps } from "@/lib/format/money";

/**
 * The buyer's premium, entered as a percentage and stored as basis points.
 *
 * Operators think in percent; the backend stores bps (1500 is 15%). The stored
 * value is echoed under the field on purpose — a rate that silently means a
 * hundredth of what someone intended is exactly the kind of thing that only
 * surfaces on an invoice.
 */
export function PremiumField({
  bps,
  frozenReason,
  error,
  onChange,
}: {
  bps: number;
  frozenReason?: string | null;
  error?: string;
  onChange: (bps: number) => void;
}) {
  const [text, setText] = useState(() => bpsToPercentString(bps));
  const [lastBps, setLastBps] = useState(bps);
  const [parseError, setParseError] = useState<string | null>(null);

  // Follow programmatic changes (loaded record, discard) without fighting typing.
  if (bps !== lastBps) {
    setLastBps(bps);
    setText(bpsToPercentString(bps));
    setParseError(null);
  }

  return (
    <Field
      label="Buyer's premium"
      htmlFor="buyers-premium"
      frozenReason={frozenReason}
      error={error ?? parseError ?? undefined}
      hint={
        frozenReason
          ? undefined
          : `Added to what a winning bidder owes. Stored as ${bps} basis points.`
      }
    >
      <div className="relative">
        <Input
          id="buyers-premium"
          inputMode="decimal"
          autoComplete="off"
          disabled={Boolean(frozenReason)}
          value={text}
          invalid={Boolean(parseError)}
          className="tnum pr-6 text-right"
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            const parsed = parsePercentToBps(next);
            if (parsed.ok) {
              setParseError(null);
              setLastBps(parsed.bps);
              onChange(parsed.bps);
            } else {
              setParseError(parsed.error);
            }
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-sm text-text-muted"
        >
          %
        </span>
      </div>
    </Field>
  );
}
