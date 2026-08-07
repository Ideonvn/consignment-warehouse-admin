/**
 * Server-anchored clock.
 *
 * Countdowns in this app decide when the operator intervenes in an auction, so
 * they must not depend on the laptop's clock being right. Every API response
 * carries a `Date` header; the client feeds it in here with the measured round
 * trip, and everything time-sensitive reads `now()` instead of `Date.now()`.
 */

let offsetMs = 0;
let anchored = false;

/** Ignore sub-2s differences: the Date header only has second resolution. */
const MIN_MEANINGFUL_OFFSET_MS = 2000;

export function anchorToServerDate(dateHeader: string | null, rttMs = 0): void {
  if (!dateHeader) return;
  const serverMs = Date.parse(dateHeader);
  if (Number.isNaN(serverMs)) return;
  // The header was generated roughly half a round trip before we read it.
  const candidate = serverMs + rttMs / 2 - Date.now();
  offsetMs = Math.abs(candidate) < MIN_MEANINGFUL_OFFSET_MS ? 0 : candidate;
  anchored = true;
}

/** Current time in ms, corrected towards the server's clock. */
export function now(): number {
  return Date.now() + offsetMs;
}

export function clockOffsetMs(): number {
  return offsetMs;
}

export function isClockAnchored(): boolean {
  return anchored;
}
