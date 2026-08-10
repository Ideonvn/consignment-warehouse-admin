import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * UUID v4 that also works outside a secure context.
 *
 * `crypto.randomUUID()` is defined only for secure contexts — https, localhost
 * and 127.0.0.1. The portal is also opened from the machine's LAN IP so it can
 * be tested on a phone in the warehouse, and that is NOT a secure context, so
 * calling it there throws "crypto.randomUUID is not a function". That would
 * break sign-in outright, because the device id every OTP verify sends is
 * generated here. `crypto.getRandomValues` carries no such restriction.
 *
 * Neither id is a security token — the device id groups a refresh-token family
 * and the other keys an upload row — but this is still a real v4 UUID from a
 * CSPRNG, because the backend validates the device id's shape.
 */
export function randomUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
