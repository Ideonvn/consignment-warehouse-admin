import { AuctionMonitor } from "@/components/monitor/AuctionMonitor";

export default async function MonitorPage({
  params,
}: {
  params: Promise<{ auctionId: string }>;
}) {
  const { auctionId } = await params;
  return <AuctionMonitor auctionId={auctionId} />;
}
