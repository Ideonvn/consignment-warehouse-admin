import type { Metadata } from "next";

export const metadata: Metadata = { title: "Auctions" };

export default function Layout({ children }: LayoutProps<"/auctions">) {
  return children;
}
