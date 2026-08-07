import { LotCreateForm } from "@/components/lots/LotCreateForm";

export default async function NewLotPage({
  params,
}: {
  params: Promise<{ auctionId: string }>;
}) {
  const { auctionId } = await params;
  return <LotCreateForm auctionId={auctionId} />;
}
