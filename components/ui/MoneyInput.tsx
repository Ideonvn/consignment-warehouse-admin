"use client";

import { useState } from "react";
import {
  formatMoney,
  minorToDecimalString,
  parseMoneyToMinor,
} from "@/lib/format/money";
import { cn } from "@/lib/utils";

export interface MoneyInputProps {
  /** Cents. This is the only unit that leaves this component. */
  value: number | null;
  onChange: (minor: number | null) => void;
  onValidityChange?: (error: string | null) => void;
  currency?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  className?: string;
  "aria-describedby"?: string;
}

/**
 * The one place rands become cents.
 *
 * The operator types rands ("2500" or "2500.50"); the value emitted is always
 * an integer number of cents, or null when the field is empty.
 */
export function MoneyInput({
  value,
  onChange,
  onValidityChange,
  currency = "ZAR",
  id,
  name,
  placeholder = "0.00",
  disabled,
  invalid,
  autoFocus,
  className,
  ...aria
}: MoneyInputProps) {
  const [text, setText] = useState(() =>
    value === null || value === undefined ? "" : minorToDecimalString(value),
  );
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  // Follow programmatic changes (form reset, loaded record) while not typing.
  // Reconciled during render rather than in an effect: no cascading re-render.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (!focused) {
      setText(
        value === null || value === undefined ? "" : minorToDecimalString(value),
      );
      setError(null);
    }
  }

  function handleChange(next: string) {
    setText(next);
    if (next.trim() === "") {
      setError(null);
      onValidityChange?.(null);
      onChange(null);
      return;
    }
    const parsed = parseMoneyToMinor(next);
    if (parsed.ok) {
      setError(null);
      onValidityChange?.(null);
      onChange(parsed.minor);
    } else {
      setError(parsed.error);
      onValidityChange?.(parsed.error);
    }
  }

  const showPreview = !error && value !== null && value !== undefined && text !== "";

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-sm text-text-muted"
        >
          {currencySymbol(currency)}
        </span>
        <input
          id={id}
          name={name}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={placeholder}
          value={text}
          aria-invalid={invalid || Boolean(error) || undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (!error && value !== null && value !== undefined) {
              setText(minorToDecimalString(value));
            }
          }}
          onChange={(event) => handleChange(event.target.value)}
          className={cn(
            "tnum h-9 w-full rounded border border-border-strong bg-surface pr-2 pl-7 text-right text-sm text-text",
            "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-muted",
            (error || invalid) && "border-danger",
          )}
          {...aria}
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : showPreview ? (
        <p className="tnum text-xs text-text-muted">
          {formatMoney(value, currency)}
        </p>
      ) : null}
    </div>
  );
}

function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}
