import type { IncrementRule } from "@/types/api";
import { formatMoney } from "./money";

export interface IncrementBand {
  minPriceMinor: number;
  incrementMinor: number;
  id?: string;
  /** Rules with a null auction_id come from the global fallback set. */
  isGlobal?: boolean;
}

export function toBands(rules: IncrementRule[]): IncrementBand[] {
  return [...rules]
    .map((rule) => ({
      id: rule.id,
      minPriceMinor: rule.min_price_minor,
      incrementMinor: rule.increment_minor,
      isGlobal: rule.auction_id === null,
    }))
    .sort((a, b) => a.minPriceMinor - b.minPriceMinor);
}

/**
 * Plain language for the banded rules: the band with the largest
 * `min_price_minor` at or below the current price wins.
 */
export function describeBands(
  bands: IncrementBand[],
  currency = "ZAR",
): string[] {
  return [...bands]
    .sort((a, b) => a.minPriceMinor - b.minPriceMinor)
    .map(
      (band) =>
        `From ${formatMoney(band.minPriceMinor, currency, { decimals: false })}: bid in ${formatMoney(
          band.incrementMinor,
          currency,
          { decimals: false },
        )} steps.`,
    );
}

/** The increment that would apply at a given price, for the preview. */
export function incrementAtPrice(
  bands: IncrementBand[],
  priceMinor: number,
): number | null {
  const applicable = [...bands]
    .filter((band) => band.minPriceMinor <= priceMinor)
    .sort((a, b) => b.minPriceMinor - a.minPriceMinor)[0];
  return applicable ? applicable.incrementMinor : null;
}
