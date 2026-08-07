import { AuctionDetail } from "@/components/auctions/AuctionDetail";

export default async function AuctionDetailPage({
  params,
}: {
  params: Promise<{ auctionId: string }>;
}) {
  const { auctionId } = await params;
  return <AuctionDetail auctionId={auctionId} />;
}
