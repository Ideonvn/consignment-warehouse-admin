/**
 * Human wording for invoices.
 *
 * A third sibling of `./ledger.ts` and `./deposits.ts`, separate for the same
 * reason those two are separate from each other: an invoice is a *document*
 * stating what was billed, the ledger is what is owed, and the deposit book is
 * what admits someone to a sale. One shared vocabulary would make "paid" mean
 * three things.
 *
 * The status→tone map is deliberately NOT here — it lives in `./status.ts` with
 * every other one, because `StatusBadge` is the single place a state becomes a
 * colour.
 */
import { formatMoney } from "./money";

/** What is still owed on this document. Never negative. */
export function outstandingOn(invoice: {
  total_minor: number;
  paid_minor: number;
}): number {
  return Math.max(invoice.total_minor - invoice.paid_minor, 0);
}

/**
 * The document's own title. **Registration decides this, the rate does not** —
 * a registered vendor selling at a zero rate still issues a tax invoice, and
 * the backend prints exactly that rule onto the PDF.
 *
 * Read the SNAPSHOT on the invoice, never a current setting: a VAT number that
 * appeared on a document someone already holds cannot be unprinted.
 */
export function invoiceTitle(invoice: { vat_number: string }): string {
  return invoice.vat_number.trim() ? "Tax invoice" : "Invoice";
}

/** "R1 200,00 of R5 000,00 settled", for a row that is part way there. */
export function describePaid(invoice: {
  total_minor: number;
  paid_minor: number;
  currency_code: string;
}): string {
  const { paid_minor, total_minor, currency_code } = invoice;
  if (paid_minor <= 0) return "Nothing allocated yet";
  if (paid_minor >= total_minor) return "Settled in full";
  return `${formatMoney(paid_minor, currency_code)} of ${formatMoney(
    total_minor,
    currency_code,
  )} settled`;
}

/**
 * Triggers a browser download of an already-fetched PDF.
 *
 * The bytes come through the authenticated API rather than a presigned URL — a
 * presigned link is a bearer capability that survives being pasted into a chat,
 * and an invoice names a person and what they owe — so there is nothing to put
 * in an `href` and this has to go through an object URL.
 */
export function saveBlobAs(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on a timer, not synchronously: Safari has not finished reading the
  // URL when click() returns, and revoking straight away yields an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
