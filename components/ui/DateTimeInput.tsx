"use client";

import { useState } from "react";
import {
  isoToLocalInputValue,
  localInputValueToIso,
  timeZoneLabel,
  timeZoneName,
} from "@/lib/format/datetime";
import { useIsClient } from "@/lib/ui/hooks";
import { cn } from "@/lib/utils";

export interface DateTimeInputProps {
  /** ISO 8601 UTC. Local time never leaves this component. */
  value: string | null;
  onChange: (iso: string | null) => void;
  id?: string;
  name?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** ISO UTC lower bound, e.g. "now" for a start date. */
  min?: string | null;
  className?: string;
  "aria-describedby"?: string;
}

/**
 * Entered and displayed in the operator's local zone, always submitted as UTC.
 * The zone is named on screen — an auction close time read two hours wrong is
 * an expensive mistake.
 */
export function DateTimeInput({
  value,
  onChange,
  id,
  name,
  disabled,
  invalid,
  min,
  className,
  ...aria
}: DateTimeInputProps) {
  const [local, setLocal] = useState(() => isoToLocalInputValue(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setLocal(isoToLocalInputValue(value));
  }

  // The server has no idea what zone the operator is in.
  const isClient = useIsClient();
  const zone = isClient ? `${timeZoneLabel()} · ${timeZoneName()}` : null;

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <input
        id={id}
        name={name}
        type="datetime-local"
        disabled={disabled}
        value={local}
        min={min ? isoToLocalInputValue(min) : undefined}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setLocal(event.target.value);
          onChange(localInputValueToIso(event.target.value));
        }}
        className={cn(
          "tnum h-9 w-full rounded border border-border-strong bg-surface px-2 text-sm text-text",
          "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-muted",
          invalid && "border-danger",
        )}
        {...aria}
      />
      <p className="text-xs text-text-muted">
        {zone ?? " "}
        {value ? ` · sent as ${value.slice(0, 16).replace("T", " ")} UTC` : ""}
      </p>
    </div>
  );
}
