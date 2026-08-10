import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The dev server blocks cross-origin requests to /_next/* by default, so
   * opening the portal on the machine's LAN IP (to test on a phone in the
   * warehouse) 403s every JS chunk: nothing hydrates, and forms fall back to a
   * native GET. Allowlist the private ranges so the dev server will serve its
   * own assets to them.
   *
   * Development only — it has no effect on `next build` / `next start`.
   */
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*"],
};

export default nextConfig;
