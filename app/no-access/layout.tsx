import type { Metadata } from "next";

export const metadata: Metadata = { title: "No admin access" };

export default function Layout({ children }: LayoutProps<"/no-access">) {
  return children;
}
