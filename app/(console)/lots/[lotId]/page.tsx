import { LotDetail } from "@/components/lots/LotDetail";

export default async function LotDetailPage({
  params,
}: {
  params: Promise<{ lotId: string }>;
}) {
  const { lotId } = await params;
  return <LotDetail lotId={lotId} />;
}
