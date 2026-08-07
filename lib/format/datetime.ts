/**
 * All timestamps cross the wire as ISO 8601 UTC strings. They are displayed in
 * the operator's local zone with the zone named, because an auction close time
 * read two hours wrong is an expensive mistake.
 */
import { format, isValid, parseISO } from "date-fns";
import { now } from "./clock";

/** e.g. "SAST" — falls back to the IANA name if the short name is unavailable. */
export function timeZoneLabel(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat(undefined, {
    timeZoneName: "short",
  }).formatToParts(at);
  const zone = parts.find((p) => p.type === "timeZoneName")?.value;
  return zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function timeZoneName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = parseISO(iso);
  return isValid(d) ? d : null;
}

/** "14 Aug 2026, 20:51 SAST" */
export function formatDateTime(
  iso: string | null | undefined,
  emptyAs = "—",
): string {
  const d = toDate(iso);
  if (!d) return emptyAs;
  return `${format(d, "d MMM yyyy, HH:mm")} ${timeZoneLabel(d)}`;
}

/** "14 Aug 2026, 20:51:07 SAST" — for audit-ish contexts like bid history. */
export function formatDateTimeSeconds(
  iso: string | null | undefined,
  emptyAs = "—",
): string {
  const d = toDate(iso);
  if (!d) return emptyAs;
  return `${format(d, "d MMM yyyy, HH:mm:ss")} ${timeZoneLabel(d)}`;
}

/** "14 Aug 2026" */
export function formatDate(
  iso: string | null | undefined,
  emptyAs = "—",
): string {
  const d = toDate(iso);
  return d ? format(d, "d MMM yyyy") : emptyAs;
}

/** "20:51:07" from a ms timestamp — for the live activity feed. */
export function formatClockTime(ms: number): string {
  return format(new Date(ms), "HH:mm:ss");
}

/** "20:51" */
export function formatTime(
  iso: string | null | undefined,
  emptyAs = "—",
): string {
  const d = toDate(iso);
  return d ? format(d, "HH:mm") : emptyAs;
}

/** ISO UTC -> the value shape `<input type="datetime-local">` wants, in local time. */
export function isoToLocalInputValue(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) return "";
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

/** `<input type="datetime-local">` value (local) -> ISO 8601 UTC. */
export function localInputValueToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isValid(d) ? d.toISOString() : null;
}

export function isPast(iso: string | null | undefined): boolean {
  const d = toDate(iso);
  return d ? d.getTime() <= now() : false;
}

export function msUntil(iso: string | null | undefined): number | null {
  const d = toDate(iso);
  return d ? d.getTime() - now() : null;
}

/**
 * Countdown text. Under a day it goes to seconds, because the last minutes of
 * an auction are the ones the operator is watching.
 */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "closed";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m`;
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`;
  return `${seconds}s`;
}

/** "in 4h 12m" / "3d ago" */
export function formatRelative(iso: string | null | undefined): string {
  const ms = msUntil(iso);
  if (ms === null) return "—";
  if (ms >= 0) return `in ${formatCountdown(ms)}`;
  return `${formatCountdown(-ms)} ago`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
