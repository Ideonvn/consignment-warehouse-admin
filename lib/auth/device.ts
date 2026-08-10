/**
 * A stable UUID per browser. The backend ties refresh-token families to it, so
 * it must survive reloads and must not be regenerated per tab.
 */
import { randomUuid } from "@/lib/utils";

const STORAGE_KEY = "cw.admin.device_id";

let cached: string | null = null;

export function getDeviceId(): string {
  if (cached) return cached;
  if (typeof window === "undefined") {
    // Never used server-side; a throwaway keeps the type honest.
    return "00000000-0000-4000-8000-000000000000";
  }
  let id = window.localStorage.getItem(STORAGE_KEY);
  if (!id || !isUuid(id)) {
    id = randomUuid();
    window.localStorage.setItem(STORAGE_KEY, id);
  }
  cached = id;
  return id;
}

export function getDeviceName(): string {
  if (typeof navigator === "undefined") return "Admin portal";
  const ua = navigator.userAgent;
  const platform = /Mac/.test(ua)
    ? "macOS"
    : /Windows/.test(ua)
      ? "Windows"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : "Unknown";
  return `Admin portal (${platform})`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
