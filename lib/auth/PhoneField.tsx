"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui/Input";
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  UNLISTED_COUNTRY,
  type Country,
} from "./countries";
import { formatNational, parseEntry, toE164, type ParsedEntry } from "./phone";
import type { IdentifierInputProps } from "./types";

/**
 * Country code plus a grouped national number — the bidder app's behaviour,
 * built from this app's own `Select` and `Input` rather than its roomy field.
 *
 * Two separate controls, not a prefix inside one bordered wrapper. Each keeps
 * its primitive's own border, radius and the global `:focus-visible` ring, so
 * the bidder app's `.field` rule (hoisting the ring to a rounded wrapper around
 * a bare input) has no shape here to fix, and nothing new is needed for it.
 *
 * The grouping is presentation only: what leaves through `onChange` is the
 * composed E.164 string, and the spaces never do.
 */
export function PhoneField({ id, onChange, invalid, autoFocus }: IdentifierInputProps) {
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [national, setNational] = useState("");

  function update(next: ParsedEntry) {
    setCountry(next.country);
    setNational(next.national);
    onChange(toE164(next.country, next.national));
  }

  return (
    <div className="flex gap-1.5">
      <Select
        aria-label="Country code"
        className="tnum w-40 shrink-0"
        value={country.iso}
        onChange={(event) =>
          update({
            country:
              COUNTRIES.find((row) => row.iso === event.target.value) ?? UNLISTED_COUNTRY,
            national,
          })
        }
      >
        {/* Only selectable by typing a + code the list does not carry; the
            number field then shows that code itself. */}
        {country === UNLISTED_COUNTRY && <option value="">Other</option>}
        {COUNTRIES.map((row) => (
          <option key={row.iso} value={row.iso}>
            +{row.dial} {row.name}
          </option>
        ))}
      </Select>
      <Input
        id={id}
        name="identifier"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        autoFocus={autoFocus}
        className="tnum"
        placeholder={country.iso === "ZA" ? "82 123 4567" : "Number"}
        value={formatNational(national, country)}
        invalid={invalid}
        onChange={(event) => update(parseEntry(event.target.value, country))}
      />
    </div>
  );
}
