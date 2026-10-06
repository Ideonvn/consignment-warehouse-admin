import { InvoiceDetail } from "@/components/invoices/InvoiceDetail";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  return <InvoiceDetail invoiceId={invoiceId} />;
}
