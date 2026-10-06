"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ErrorState, Note, Skeleton } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataPoint, Panel } from "@/components/ui/Panel";
import { InvoiceStatusBadge } from "@/components/ui/StatusBadge";
import { errorMessage } from "@/lib/api/errors";
import { useInvoice } from "@/lib/api/queries";
import { formatDateTime } from "@/lib/format/datetime";
import { describePaid, invoiceTitle, outstandingOn } from "@/lib/format/invoices";
import { formatBps, formatMoney } from "@/lib/format/money";
import { usePageTitle } from "@/lib/ui/use-page-title";
import { InvoicePdfButton } from "./InvoicePdfButton";

/**
 * One invoice, exactly as it was frozen at issue.
 *
 * **Nothing on this screen is editable, and that is the feature.** An invoice
 * bills ledger entries that already exist and never recalculates them — a
 * document that recomputed its own total from the auction's current commission
 * rate would disagree with the ledger the day someone edited that rate. A
 * mistake is corrected on the ledger, and the next invoice bills what is
 * actually owed.
 *
 * The allocations are shown so an operator can see *why* it reads as paid.
 * Without them the only way to answer "has this been paid" is to reconcile the
 * statement by eye, which is the job this screen exists to remove.
 */
export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const { data: invoice, isPending, error, refetch } = useInvoice(invoiceId);
  usePageTitle(invoice?.number);

  if (error) {
    return (
      <ErrorState
        title="Could not load the invoice"
        message={errorMessage(error)}
        onRetry={() => void refetch()}
      />
    );
  }

  if (isPending || !invoice) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const currency = invoice.currency_code;
  const owing = outstandingOn(invoice);
  const hasTax = invoice.tax_minor !== 0 || invoice.tax_rate_bps !== 0;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Invoices", href: "/invoices" }, { label: invoice.number }]}
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono">{invoice.number}</span>
            <InvoiceStatusBadge status={invoice.status} />
          </span>
        }
        subtitle={`${invoiceTitle(invoice)} · ${describePaid(invoice)}`}
        actions={
          <>
            <InvoicePdfButton
              invoiceId={invoice.id}
              number={invoice.number}
              size="md"
              variant="primary"
            />
            <Link href={`/users/${invoice.user_id}`}>
              <Button variant="secondary">Ledger</Button>
            </Link>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <Panel title="The document">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <DataPoint label="Billed to">
              <Link
                href={`/users/${invoice.user_id}`}
                className="hover:underline"
              >
                {invoice.bill_to_name ?? "—"}
              </Link>
            </DataPoint>
            {/* The three rows below are what the DOCUMENT printed, frozen at
                issue — not what the user record says today. An operator fielding
                "this invoice has my old number on it" needs the frozen value,
                and the live one is one click away under "Billed to". */}
            <DataPoint label="ID / passport (printed)">
              {invoice.bill_to_id_number ? (
                <span className="font-mono text-xs">{invoice.bill_to_id_number}</span>
              ) : (
                <span className="text-text-muted">Not printed</span>
              )}
            </DataPoint>
            <DataPoint label="Cellphone (printed)">
              {invoice.bill_to_phone ? (
                <span className="font-mono text-xs">{invoice.bill_to_phone}</span>
              ) : (
                <span className="text-text-muted">Not printed</span>
              )}
            </DataPoint>
            {/* NOT what this document asks for. Since 2026-10-05 the PDF tells
                the bidder to quote the invoice number, so one bank line maps to
                one document; this is their standing account reference, kept
                because payments made before the change quote it. */}
            <DataPoint label="Account reference at issue">
              <span className="font-mono text-xs">
                {invoice.bill_to_reference ?? "—"}
              </span>
            </DataPoint>
            <DataPoint label="Issued">
              <span className="tnum">{formatDateTime(invoice.issued_at)}</span>
            </DataPoint>
            <DataPoint label="Due">
              <span className="tnum">{formatDateTime(invoice.due_at)}</span>
            </DataPoint>
            <DataPoint label="Sale">
              <Link
                href={`/auctions/${invoice.auction_id}`}
                className="hover:underline"
              >
                Open the auction
              </Link>
            </DataPoint>
            <DataPoint label="VAT number">
              {invoice.vat_number.trim() ? (
                <span className="font-mono text-xs">{invoice.vat_number}</span>
              ) : (
                <span className="text-text-muted">Not registered at issue</span>
              )}
            </DataPoint>
            <DataPoint label="VAT rate">
              <span className="tnum">{formatBps(invoice.tax_rate_bps)}</span>
            </DataPoint>
            <DataPoint label="Still owing">
              <span
                className={
                  owing > 0
                    ? "tnum font-semibold text-danger-ink"
                    : "tnum text-text-muted"
                }
              >
                {owing > 0 ? formatMoney(owing, currency) : "Nothing"}
              </span>
            </DataPoint>
          </div>

          <Note tone="info" className="mt-3">
            The VAT number and rate above are <strong>snapshots</strong> taken
            when this was issued, not today&apos;s settings — a number that
            appeared on a document someone holds cannot be unprinted. Changing
            the configuration does not change this invoice.
          </Note>
        </Panel>

        <Panel
          title="Lines"
          description="Frozen at issue. The hammer price and the commission on it are separate lines, so a later rate change cannot appear to rewrite history."
          bodyClassName="p-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken">
                <tr>
                  <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-text-muted">
                    Description
                  </th>
                  <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                    {hasTax ? "Excl. VAT" : "Amount"}
                  </th>
                  {hasTax && (
                    <>
                      <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                        VAT
                      </th>
                      <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-text-muted">
                        Incl. VAT
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line) => (
                  <tr
                    key={`${line.position}-${line.description}`}
                    className="border-t border-border"
                  >
                    <td className="px-2.5 py-1.5">
                      {line.lot_id ? (
                        <Link
                          href={`/lots/${line.lot_id}`}
                          className="hover:underline"
                        >
                          {line.description}
                        </Link>
                      ) : (
                        line.description
                      )}
                    </td>
                    <td className="tnum px-2.5 py-1.5 text-right">
                      {formatMoney(line.net_minor, currency)}
                    </td>
                    {hasTax && (
                      <>
                        <td className="tnum px-2.5 py-1.5 text-right text-text-muted">
                          {formatMoney(line.tax_minor, currency)}
                        </td>
                        <td className="tnum px-2.5 py-1.5 text-right">
                          {formatMoney(line.gross_minor, currency)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border-strong bg-surface-sunken">
                <tr>
                  <td className="px-2.5 py-1.5 text-xs font-semibold text-text-muted">
                    Subtotal
                  </td>
                  <td className="tnum px-2.5 py-1.5 text-right">
                    {formatMoney(invoice.subtotal_minor, currency)}
                  </td>
                  {hasTax && (
                    <>
                      <td className="tnum px-2.5 py-1.5 text-right text-text-muted">
                        {formatMoney(invoice.tax_minor, currency)}
                      </td>
                      <td className="tnum px-2.5 py-1.5 text-right font-semibold">
                        {formatMoney(invoice.total_minor, currency)}
                      </td>
                    </>
                  )}
                </tr>
                {!hasTax && (
                  <tr className="border-t border-border">
                    <td className="px-2.5 py-1.5 text-xs font-semibold text-text-muted">
                      Total
                    </td>
                    <td className="tnum px-2.5 py-1.5 text-right font-semibold">
                      {formatMoney(invoice.total_minor, currency)}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </Panel>

        <Panel
          title="What has been paid"
          description="Allocations from payments on this person's ledger. An allocation whose payment has been reversed stops counting on its own — that is the only way to undo one."
          bodyClassName={invoice.allocations.length ? "p-0" : undefined}
        >
          {invoice.allocations.length === 0 ? (
            <p className="text-sm text-text-muted">
              Nothing allocated to this invoice yet. Record a payment on{" "}
              <Link
                href={`/users/${invoice.user_id}`}
                className="text-accent-strong hover:underline"
              >
                their ledger
              </Link>{" "}
              and allocate it there — there is no mark-as-paid here, and should
              not be.
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {invoice.allocations.map((allocation, index) => (
                  <tr key={index} className="border-b border-border last:border-0">
                    <td className="px-2.5 py-1.5 text-text-muted">
                      Allocated from a payment
                    </td>
                    <td className="tnum px-2.5 py-1.5 text-right font-medium">
                      {formatMoney(allocation.amount_minor, currency)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-surface-sunken">
                  <td className="px-2.5 py-1.5 text-xs font-semibold text-text-muted">
                    Settled
                  </td>
                  <td className="tnum px-2.5 py-1.5 text-right font-semibold">
                    {formatMoney(invoice.paid_minor, currency)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}
