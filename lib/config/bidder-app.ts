/**
 * Links into the bidder-facing app.
 *
 * The bidder app's canonical URL shape is still being settled in that
 * repository, so the base lives in ONE constant and every path is built here.
 * If the routing lands differently, this file is the change — not a search
 * across components.
 *
 * The base is a build-time `NEXT_PUBLIC_*`, so it is inlined into the bundle
 * and a change needs a redeploy, not a restart. It falls back to production
 * rather than to localhost: a share link is copied and pasted to someone else,
 * so a link to `localhost:3000` is not a degraded link, it is a broken one that
 * looks fine to the person who copied it.
 */
const DEFAULT_BIDDER_APP_URL = "https://consignment-warehouse.com";

/** No trailing slash, so paths can be appended without doubling it. */
export function bidderAppBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BIDDER_APP_URL?.trim();
  return (configured || DEFAULT_BIDDER_APP_URL).replace(/\/+$/, "");
}

/** Where an anonymous visitor browses a public auction. */
export function publicAuctionUrl(auctionId: string): string {
  return `${bidderAppBaseUrl()}/auctions/${auctionId}`;
}

/**
 * A single lot. This is the link that actually gets posted into a group chat —
 * people share the item, not the sale. Only meaningful when the lot's auction
 * is public, since lots inherit visibility and have no flag of their own.
 */
export function publicLotUrl(lotId: string): string {
  return `${bidderAppBaseUrl()}/lots/${lotId}`;
}
