"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { getInvoicePdf } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/errors";
import { saveBlobAs } from "@/lib/format/invoices";

/**
 * Downloads the document.
 *
 * **The bytes come through the API, not a presigned URL**, so this cannot be a
 * plain `<a href>`: the request has to carry the bearer token. That is the
 * deliberate design — a presigned link is a bearer capability that survives
 * being pasted into a chat, and an invoice names a person and what they owe.
 *
 * The same bytes the bidder downloads. One renderer, one stored object: there
 * is no operator-only version of the document, so what is on screen here is
 * exactly what the customer has.
 */
export function InvoicePdfButton({
  invoiceId,
  number,
  size = "sm",
  variant = "secondary",
}: {
  invoiceId: string;
  /** Used as the filename, so the file on disk matches the document. */
  number: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary";
}) {
  const download = useMutation({
    mutationFn: () => getInvoicePdf(invoiceId),
    onSuccess: (blob) => saveBlobAs(blob, `${number}.pdf`),
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Button
      size={size}
      variant={variant}
      loading={download.isPending}
      onClick={() => download.mutate()}
    >
      PDF
    </Button>
  );
}
