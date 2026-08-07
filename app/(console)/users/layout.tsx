import type { Metadata } from "next";

export const metadata: Metadata = { title: "Users" };

export default function Layout({ children }: LayoutProps<"/users">) {
  return children;
}
