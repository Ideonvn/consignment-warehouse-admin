import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Consignment Warehouse — Admin",
    template: "%s · Consignment Warehouse Admin",
  },
  description: "Operator console for Consignment Warehouse auctions.",
  robots: { index: false, follow: false },
};

/**
 * Applies the stored theme during head parsing, before the browser paints
 * anything. next-themes ships an equivalent script, but it renders inside
 * <body> (where the provider lives), which is after the body background can
 * already have been painted — an operator opening this at night would get a
 * white flash. This mirrors next-themes' resolution exactly, so the two always
 * agree: stored value, "system" resolved through matchMedia, default light.
 */
const THEME_PRE_PAINT = `(function(){try{var k="cw.admin.theme",t=localStorage.getItem(k)||"light",r=t==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;var d=document.documentElement;d.setAttribute("data-theme",r);d.style.colorScheme=r;}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the pre-paint script sets data-theme and
    // color-scheme on <html> before React hydrates, so the server markup and
    // the live DOM legitimately differ on this element.
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_PRE_PAINT }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg text-text">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
