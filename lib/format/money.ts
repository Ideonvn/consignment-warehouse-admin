/**
 * Money is an integer number of cents everywhere in this app. Division by 100
 * happens once, at render. Parsing goes the other way with integer maths only.
 */

const formatterCache = new Map<string, Intl.NumberFormat>();

/** ZAR is the expected currency; en-ZA renders it as "R 1 500,00". */
const DISPLAY_LOCALE = "en-ZA";

function formatter(currency: string, decimals: boolean) {
  const key = `${currency}:${decimals}`;
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(DISPLAY_LOCALE, {
      style: "currency",
      currency,
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
    });
    formatterCache.set(key, f);
  }
  return f;
}

/** 250000 + "ZAR" -> "R 2 500,00" */
export function formatMoney(
  minor: number | null | undefined,
  currency = "ZAR",
  options: { emptyAs?: string; decimals?: boolean } = {},
): string {
  const { emptyAs = "—", decimals = true } = options;
  if (minor === null || minor === undefined || Number.isNaN(minor)) {
    return emptyAs;
  }
  return formatter(currency, decimals).format(minor / 100);
}

/** Plain-number rendering for inputs and CSV-ish contexts: 250000 -> "2500.00" */
export function minorToDecimalString(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${negative ? "-" : ""}${whole}.${String(cents).padStart(2, "0")}`;
}

export type MoneyParseResult =
  | { ok: true; minor: number }
  | { ok: false; error: string };

/**
 * Parse operator-typed rands into cents.
 *
 * Deliberately strict rather than clever: spaces are ignored, a single "." or
 * "," is the decimal separator, and anything ambiguous (two separators, more
 * than two decimals) is rejected with a message instead of guessed at. A
 * silently misread amount here is a real-money mistake.
 */
export function parseMoneyToMinor(raw: string): MoneyParseResult {
  const cleaned = raw
    .replace(/[\s  ]/g, "")
    .replace(/^[A-Za-z$€£]+/, "")
    .trim();

  if (cleaned === "") return { ok: false, error: "Enter an amount" };

  const separators = cleaned.match(/[.,]/g) ?? [];
  if (separators.length > 1) {
    return { ok: false, error: "Enter an amount like 1500.00" };
  }

  const normalised = cleaned.replace(",", ".");
  if (!/^-?\d*(\.\d{0,2})?$/.test(normalised)) {
    return { ok: false, error: "Enter an amount like 1500.00" };
  }
  if (normalised.startsWith("-")) {
    return { ok: false, error: "Amount cannot be negative" };
  }

  const [wholeRaw, fracRaw = ""] = normalised.split(".");
  const whole = wholeRaw === "" ? 0 : Number.parseInt(wholeRaw, 10);
  if (!Number.isFinite(whole)) return { ok: false, error: "Enter an amount" };
  const frac = Number.parseInt(fracRaw.padEnd(2, "0"), 10) || 0;
  return { ok: true, minor: whole * 100 + frac };
}

/** "R2 500,00 short" style helper for the decisions queue shortfall. */
export function formatShortfall(
  reserveMinor: number,
  topBidMinor: number | null,
  currency = "ZAR",
): string {
  const shortfall = reserveMinor - (topBidMinor ?? 0);
  return formatMoney(Math.max(shortfall, 0), currency);
}

/* --------------------------------------------------------------- rates */

/**
 * The buyer's premium is stored in BASIS POINTS — 1500 is 15%. Operators think
 * in percent, so the UI collects a percentage and converts here, and always
 * shows the stored value back so there is no ambiguity about what was saved.
 */
export function bpsToPercentString(bps: number): string {
  const percent = bps / 100;
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(2);
}

export type BpsParseResult =
  | { ok: true; bps: number }
  | { ok: false; error: string };

/** "15" -> 1500, "12.5" -> 1250. Two decimal places is the resolution. */
export function parsePercentToBps(raw: string): BpsParseResult {
  const cleaned = raw.replace(/[\s%]/g, "").replace(",", ".");
  if (cleaned === "") return { ok: true, bps: 0 };
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned)) {
    return { ok: false, error: "Enter a percentage like 15 or 12.5" };
  }
  const percent = Number.parseFloat(cleaned);
  if (!Number.isFinite(percent)) {
    return { ok: false, error: "Enter a percentage like 15 or 12.5" };
  }
  if (percent > 100) return { ok: false, error: "That is over 100%" };
  // Round rather than truncate: 12.345 typed by hand should not silently drop.
  return { ok: true, bps: Math.round(percent * 100) };
}

/** "15%" for display next to a stored bps value. */
export function formatBps(bps: number): string {
  return `${bpsToPercentString(bps)}%`;
}
