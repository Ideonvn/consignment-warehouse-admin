/**
 * Human wording for the security-deposit book.
 *
 * A deliberate sibling of `./ledger.ts` rather than a generalisation of it. The
 * two books share a shape — append-only, signed amounts, corrections by
 * reversal — but they answer different questions, and one shared set of labels
 * is how "deposit received" and "payment received" end up interchangeable on
 * screen. They are not: one is what lets someone bid, the other is what they owe.
 */
import type { DepositEntryType } from "@/types/api";
import { formatMoney } from "./money";

export interface DepositEntryMeta {
  label: string;
  /** What this type does to what we hold, in the operator's words. */
  effect: "in" | "out" | "either";
  hint: string;
  /** Can the operator post this from the record form? */
  postable: boolean;
}

export const DEPOSIT_ENTRY_META: Record<DepositEntryType, DepositEntryMeta> = {
  paid: {
    label: "Deposit received",
    effect: "in",
    hint: "Money received as a security deposit. This is what lets them bid.",
    postable: true,
  },
  refunded: {
    label: "Deposit refunded",
    effect: "out",
    hint: "Deposit paid back out. Can take them below an auction's requirement.",
    postable: true,
  },
  reversal: {
    label: "Correction",
    effect: "either",
    hint: "Cancels an earlier entry. Both stay on the record.",
    postable: false,
  },
};

/** Types the operator can post directly. `reversal` has its own route. */
export const POSTABLE_DEPOSIT_TYPES = (
  Object.keys(DEPOSIT_ENTRY_META) as DepositEntryType[]
).filter((type) => DEPOSIT_ENTRY_META[type].postable);

/**
 * What we hold, as a sentence. Deliberately NOT `describeBalance`'s wording:
 * "in credit" is a claim about the trading account and a held deposit is not
 * credit — it does not reduce what anyone owes.
 */
export function describeHeld(
  heldMinor: number,
  currency = "ZAR",
): { text: string; tone: "held" | "none" } {
  if (heldMinor <= 0) return { text: "No deposit held", tone: "none" };
  return { text: `${formatMoney(heldMinor, currency)} held`, tone: "held" };
}

/** What posting this entry would do, stated before it happens. */
export function describeDepositEffect(
  type: DepositEntryType,
  amountMinor: number | null,
  heldMinor: number,
  currency = "ZAR",
): string | null {
  if (amountMinor === null || amountMinor <= 0) return null;
  const effect = DEPOSIT_ENTRY_META[type].effect;
  if (effect === "either") return null;

  const after = heldMinor + (effect === "in" ? amountMinor : -amountMinor);
  const verb = effect === "in" ? "Adds" : "Takes back";
  return `${verb} ${formatMoney(amountMinor, currency)} — leaves ${formatMoney(
    after,
    currency,
  )} held.`;
}
