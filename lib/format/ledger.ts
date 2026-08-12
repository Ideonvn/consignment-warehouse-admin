/**
 * Human wording for the credit ledger.
 *
 * Two rules from the backend shape everything here:
 *  - the ledger is APPEND-ONLY: a mistake is corrected by posting a reversal
 *    that points at the original, so there is no edit or delete anywhere;
 *  - the SIGN comes from the entry type, never from the operator. Amounts are
 *    posted as positive magnitudes and come back signed.
 */
import type { LedgerEntryType } from "@/types/api";
import { formatMoney } from "./money";

export interface LedgerEntryMeta {
  label: string;
  /** What this type does to the balance, in the operator's words. */
  effect: "credit" | "debit" | "either";
  hint: string;
  /** Can the operator post this from the record form? */
  postable: boolean;
}

export const LEDGER_ENTRY_META: Record<LedgerEntryType, LedgerEntryMeta> = {
  deposit: {
    label: "Deposit",
    effect: "credit",
    hint: "Money received to bid against. Adds to their credit.",
    postable: true,
  },
  payment: {
    label: "Payment",
    effect: "credit",
    hint: "Money received against what they owe. Adds to their credit.",
    postable: true,
  },
  refund: {
    label: "Refund",
    effect: "debit",
    hint: "Money paid back out to them. Reduces their credit.",
    postable: true,
  },
  adjustment: {
    label: "Adjustment",
    effect: "either",
    hint: "A correction that is not a real movement of money. You must say which way it goes.",
    postable: true,
  },
  lot_won: {
    label: "Lot won",
    effect: "debit",
    hint: "Raised automatically when a lot closes to them.",
    postable: false,
  },
  buyers_premium: {
    label: "Buyer's premium",
    effect: "debit",
    hint: "Raised automatically alongside a won lot.",
    postable: false,
  },
  reversal: {
    label: "Correction",
    effect: "either",
    hint: "Cancels an earlier entry. Both stay on the record.",
    postable: false,
  },
};

/** Types the operator can post directly. `reversal` has its own route. */
export const POSTABLE_ENTRY_TYPES = (
  Object.keys(LEDGER_ENTRY_META) as LedgerEntryType[]
).filter((type) => LEDGER_ENTRY_META[type].postable);

/**
 * A balance as a sentence rather than a signed integer: "R2 000,00 owing",
 * "R10 000,00 in credit". An operator reading a minus sign under time pressure
 * is one misread away from chasing the wrong person.
 */
export function describeBalance(
  balanceMinor: number,
  currency = "ZAR",
): { text: string; tone: "credit" | "owing" | "settled" } {
  if (balanceMinor === 0) return { text: "Settled", tone: "settled" };
  if (balanceMinor > 0) {
    return {
      text: `${formatMoney(balanceMinor, currency)} in credit`,
      tone: "credit",
    };
  }
  return {
    text: `${formatMoney(Math.abs(balanceMinor), currency)} owing`,
    tone: "owing",
  };
}

/** What posting this entry would do, stated before it happens. */
export function describeEffect(
  type: LedgerEntryType,
  amountMinor: number | null,
  balanceMinor: number,
  currency = "ZAR",
  direction?: "credit" | "debit",
): string | null {
  if (amountMinor === null || amountMinor <= 0) return null;
  const effect = LEDGER_ENTRY_META[type].effect;
  const resolved = effect === "either" ? direction : effect;
  if (!resolved) return null;

  const delta = resolved === "credit" ? amountMinor : -amountMinor;
  const after = describeBalance(balanceMinor + delta, currency);
  return `${resolved === "credit" ? "Adds" : "Takes off"} ${formatMoney(
    amountMinor,
    currency,
  )} — leaves them ${after.text.toLowerCase()}.`;
}
